import { GAME_VARIANTS, type GameRunType, type GameVariant, type GuessGameMode } from "@/actions/types";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import MenuManager from "./MenuManager";
import SignInPrompt from "./SignInPrompt";

function isGameVariant(value: string | undefined): value is GameVariant {
    return (GAME_VARIANTS as readonly string[]).includes(value ?? "");
}

export default async function GamePage({ gameMode, gameVariant, gameRunType, multiplayerLobbyCode }: { gameMode: GuessGameMode; gameVariant?: string | string[]; gameRunType?: string | string[]; multiplayerLobbyCode?: string | string[] }) {
    const selectedVariant = Array.isArray(gameVariant) ? gameVariant[0] : gameVariant;
    const selectedRunType = Array.isArray(gameRunType) ? gameRunType[0] : gameRunType;
    const selectedLobby = Array.isArray(multiplayerLobbyCode) ? multiplayerLobbyCode[0] : multiplayerLobbyCode;

    if (!isGameVariant(selectedVariant)) {
        redirect(`/?game=${gameMode}`);
    }
    if (selectedRunType && selectedRunType !== "standard" && selectedRunType !== "daily") redirect(`/?game=${gameMode}`);
    if (selectedRunType === "daily" && (selectedVariant !== "classic" || selectedLobby)) redirect(`/?game=${gameMode}`);

    const session = await auth();

    if (!session?.user?.banchoId && selectedRunType !== "daily") {
        return <SignInPrompt />;
    }

    return <MenuManager gameMode={gameMode} gameVariant={selectedVariant} gameRunType={(selectedRunType ?? "standard") as GameRunType} multiplayerLobbyCode={selectedLobby} isGuestDaily={!session?.user?.banchoId && selectedRunType === "daily"} />;
}
