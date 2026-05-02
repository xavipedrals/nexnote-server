import http2 from "node:http2";
import { SignJWT, importPKCS8 } from "jose";
const BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? "com.xavi.nexnote";
/** Sandbox if this job asked for it (e.g. iOS DEBUG) or Cloud Run env says so. */
function apnsHost(useSandboxFromJob) {
    const sandbox = useSandboxFromJob === true ||
        process.env.APNS_USE_SANDBOX === "true" ||
        process.env.APNS_USE_SANDBOX === "1";
    return sandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com";
}
async function mintApnsJwt() {
    const teamId = process.env.APNS_TEAM_ID;
    const keyId = process.env.APNS_KEY_ID;
    let pem = process.env.APNS_PRIVATE_KEY ?? "";
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
function sendAlert(deviceToken, jwt, podcastId, podcastTitle, useSandboxFromJob) {
    const host = apnsHost(useSandboxFromJob);
    const title = (podcastTitle || "Podcast").slice(0, 120);
    const payload = {
        aps: {
            alert: {
                title: "Podcast ready",
                body: `${title} is ready to play.`,
            },
            sound: "default",
        },
        nexnote_push_type: "podcast_ready",
        podcast_id: podcastId,
    };
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
        let apnsId;
        req.on("response", (headers) => {
            status = Number(headers[":status"] ?? 0);
            const id = headers["apns-id"];
            if (typeof id === "string")
                apnsId = id;
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
/**
 * When `notifyWhenReady` is true and APNs env is configured, loads device
 * tokens for the user and sends an alert to each. Failures are logged only —
 * the podcast row is already `ready`.
 */
export async function sendPodcastReadyPushIfNeeded(admin, opts) {
    if (!opts.notifyWhenReady)
        return;
    if (!process.env.APNS_TEAM_ID ||
        !process.env.APNS_KEY_ID ||
        !process.env.APNS_PRIVATE_KEY) {
        console.warn("apns: APNS_TEAM_ID / APNS_KEY_ID / APNS_PRIVATE_KEY not set; skipping push");
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
        .map((r) => r.device_token)
        .filter(Boolean);
    if (tokens.length === 0) {
        console.log(`apns: no device tokens for user ${opts.userId}; skipping push`);
        return;
    }
    let jwt;
    try {
        jwt = await mintApnsJwt();
    }
    catch (e) {
        console.error("apns: failed to mint JWT:", e);
        return;
    }
    for (const token of tokens) {
        try {
            const res = await sendAlert(token, jwt, opts.podcastId, opts.title, opts.useApnsSandbox);
            if (res.status >= 200 && res.status < 300) {
                console.log(`apns: delivered podcast_ready to …${token.slice(-8)} id=${res.apnsId ?? "?"}`);
            }
            else {
                console.warn(`apns: push failed status=${res.status} body=${res.body.slice(0, 200)}`);
            }
        }
        catch (e) {
            console.warn("apns: push error:", e);
        }
    }
}
//# sourceMappingURL=apns.js.map