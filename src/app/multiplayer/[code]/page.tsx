import { auth } from "@/lib/auth";
import SignInPrompt from "@/app/games/shared/SignInPrompt";
import LobbyClient from "./LobbyClient";
import { normalizeLobbyCode, readMultiplayerLobby } from "@/lib/multiplayer";

export const dynamic = "force-dynamic";

export default async function MultiplayerLobbyPage({
    params,
}: {
    params: Promise<{ code: string }>;
}) {
    const session = await auth();
    if (!session?.user?.banchoId) return <SignInPrompt />;

    const { code } = await params;
    const normalizedCode = normalizeLobbyCode(code);
    const lobby = await readMultiplayerLobby(normalizedCode);
    const initialLobby = lobby?.players.some((player) => player.userId === session.user.banchoId) ? lobby : null;

    return <LobbyClient code={normalizedCode} userId={session.user.banchoId} initialLobby={initialLobby} />;
}
