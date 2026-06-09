import http2 from "node:http2";
import { SignJWT, importPKCS8 } from "npm:jose";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "com.xavi.nexnote";

function apnsHost(): string {
    const sandbox =
        Deno.env.get("APNS_USE_SANDBOX") === "true" ||
        Deno.env.get("APNS_USE_SANDBOX") === "1";
    return sandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com";
}

async function mintApnsJwt(): Promise<string> {
    const teamId = Deno.env.get("APNS_TEAM_ID");
    const keyId = Deno.env.get("APNS_KEY_ID");
    let pem = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
    if (!teamId || !keyId || !pem) {
        throw new Error("apns_env_missing");
    }
    pem = pem.replace(/\\n/g, "\n");
    const key = await importPKCS8(pem, "ES256");
    return await new SignJWT({})
        .setProtectedHeader({ alg: "ES256", kid: keyId })
        .setIssuer(teamId)
        .setIssuedAt()
        .setExpirationTime("50m")
        .sign(key);
}

function sendAlert(
    deviceToken: string,
    jwt: string,
    payload: Record<string, unknown>,
): Promise<{ status: number; apnsId?: string; body: string }> {
    const host = apnsHost();
    const body = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
        const client = http2.connect(`https://${host}`);
        const timer = setTimeout(() => {
            client.destroy();
            reject(new Error("apns_timeout"));
        }, 20_000);

        client.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });

        const req = client.request({
            ":method": "POST",
            ":path": `/3/device/${deviceToken}`,
            "apns-topic": BUNDLE_ID,
            "authorization": `bearer ${jwt}`,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "content-type": "application/json",
        });

        let status = 0;
        let apnsId: string | undefined;
        req.on("response", (headers) => {
            status = Number(headers[":status"] ?? 0);
            const id = headers["apns-id"];
            if (typeof id === "string") apnsId = id;
        });

        let respBody = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => {
            respBody += chunk;
        });
        req.on("end", () => {
            clearTimeout(timer);
            client.close();
            resolve({ status, apnsId, body: respBody });
        });

        req.write(body);
        req.end();
    });
}

async function sendReadyPushIfNeeded(
    admin: SupabaseClient,
    opts: {
        userId: string;
        notifyWhenReady: boolean;
        alertTitle: string;
        alertBody: string;
        pushType: string;
        data: Record<string, string>;
    },
): Promise<void> {
    if (!opts.notifyWhenReady) return;

    if (
        !Deno.env.get("APNS_TEAM_ID") ||
        !Deno.env.get("APNS_KEY_ID") ||
        !Deno.env.get("APNS_PRIVATE_KEY")
    ) {
        console.warn(
            "apns: APNS_TEAM_ID / APNS_KEY_ID / APNS_PRIVATE_KEY not set; skipping push",
        );
        return;
    }

    const { data: rows, error } = await admin
        .from("user_push_devices")
        .select("device_token")
        .eq("user_id", opts.userId);

    if (error) {
        console.error("apns: failed to load device tokens:", error.message);
        return;
    }
    const tokens = (rows ?? [])
        .map((r) => (r as { device_token: string }).device_token)
        .filter(Boolean);
    if (tokens.length === 0) {
        console.log(
            `apns: no device tokens for user ${opts.userId}; skipping push`,
        );
        return;
    }

    let jwt: string;
    try {
        jwt = await mintApnsJwt();
    } catch (e) {
        console.error("apns: failed to mint JWT:", e);
        return;
    }

    const payload = {
        aps: {
            alert: {
                title: opts.alertTitle,
                body: opts.alertBody,
            },
            sound: "default",
        },
        nexnote_push_type: opts.pushType,
        ...opts.data,
    };

    for (const token of tokens) {
        try {
            const res = await sendAlert(token, jwt, payload);
            if (res.status >= 200 && res.status < 300) {
                console.log(
                    `apns: delivered ${opts.pushType} to …${token.slice(-8)} id=${res.apnsId ?? "?"}`,
                );
            } else {
                console.warn(
                    `apns: push failed status=${res.status} body=${res.body.slice(0, 200)}`,
                );
            }
        } catch (e) {
            console.warn("apns: push error:", e);
        }
    }
}

export async function sendFlashcardReadyPushIfNeeded(
    admin: SupabaseClient,
    opts: {
        userId: string;
        deckId: string;
        noteTitle: string;
        notifyWhenReady: boolean;
    },
): Promise<void> {
    const title = (opts.noteTitle || "Your note").slice(0, 120);
    await sendReadyPushIfNeeded(admin, {
        userId: opts.userId,
        notifyWhenReady: opts.notifyWhenReady,
        alertTitle: "Flashcards ready",
        alertBody: `${title} flashcards are ready to study.`,
        pushType: "flashcard_ready",
        data: {
            deck_id: opts.deckId,
        },
    });
}
