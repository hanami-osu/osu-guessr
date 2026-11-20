import { createServer } from "node:http";
import next from "next";
import { attachMultiplayerSocketServer } from "@/lib/multiplayer/multiplayer-socket-server";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
// Auth cookies are host-scoped, so sign-in only works on the origin Auth.js redirects back to.
const devOrigin = dev && process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL) : null;
const LOOPBACK_ALIASES = new Set(["0.0.0.0", "127.0.0.1", "[::1]"]);

async function main(): Promise<void> {
    const app = next({ dev, hostname, port });
    await app.prepare();
    
    const handle = app.getRequestHandler();
    const server = createServer((req, res) => {
        const requestHost = req.headers.host;
        // Server-to-server calls carry no auth cookies, and fetch drops their Authorization header on a cross-origin redirect.
        const isInternalApi = req.url?.startsWith("/api/internal/");
        if (devOrigin && requestHost && !isInternalApi && requestHost !== devOrigin.host && LOOPBACK_ALIASES.has(requestHost.replace(/:\d+$/, ""))) {
            res.writeHead(307, { Location: new URL(req.url ?? "/", devOrigin).toString() }).end();
            return;
        }
        void handle(req, res);
    });
    await attachMultiplayerSocketServer(server, app.getUpgradeHandler());

    server.listen(port, hostname, () => {
        console.log(`> Ready on ${devOrigin?.origin ?? `http://${hostname}:${port}`}`);
    });
}

void main().catch((error) => {
    console.error(error);
    process.exit(1);
});
