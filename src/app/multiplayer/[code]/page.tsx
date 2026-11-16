import { auth } from "@/lib/auth";
import SignInPrompt from "@/app/games/shared/SignInPrompt";
import LobbyClient from "./LobbyClient";
import { normalizeLobbyCode, readMultiplayerLobby, toPublicMultiplayerLobby } from "@/lib/multiplayer";

export const dynamic = "force-dynamic";

export default async function MultiplayerLobbyPage({ params }: { params: Promise<{ code: string }> }) {
    const session = await auth();
    const userId = session?.user?.banchoId;
    if (!userId) return <SignInPrompt />;

    const { code } = await params;
    const normalizedCode = normalizeLobbyCode(code);
    const lobby = await readMultiplayerLobby(normalizedCode);
    const initialLobby = lobby?.players.some((player) => player.userId === userId) ? toPublicMultiplayerLobby(lobby) : null;

    return <LobbyClient code={normalizedCode} userId={userId} initialLobby={initialLobby} />;
}
