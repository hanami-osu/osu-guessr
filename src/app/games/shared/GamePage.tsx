import { GAME_VARIANTS, type GameVariant, type GuessGameMode } from "@/actions/types";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import MenuManager from "./MenuManager";
import SignInPrompt from "./SignInPrompt";

function isGameVariant(value: string | undefined): value is GameVariant {
    return (GAME_VARIANTS as readonly string[]).includes(value ?? "");
}

export default async function GamePage({ gameMode, gameVariant, multiplayerLobbyCode }: { gameMode: GuessGameMode; gameVariant?: string | string[]; multiplayerLobbyCode?: string | string[] }) {
    const selectedVariant = Array.isArray(gameVariant) ? gameVariant[0] : gameVariant;
    const selectedLobby = Array.isArray(multiplayerLobbyCode) ? multiplayerLobbyCode[0] : multiplayerLobbyCode;

    if (!isGameVariant(selectedVariant)) {
        redirect(`/?game=${gameMode}`);
    }

    const session = await auth();

    if (!session?.user?.banchoId) {
        return <SignInPrompt />;
    }

    return <MenuManager gameMode={gameMode} gameVariant={selectedVariant} multiplayerLobbyCode={selectedLobby} />;
}
