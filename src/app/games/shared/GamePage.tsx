import { GameMode, type GameVariant } from "@/actions/types";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import MenuManager from "./MenuManager";
import SignInPrompt from "./SignInPrompt";

function isGameVariant(value: string | undefined): value is GameVariant {
    return value === "classic" || value === "survival";
}

export default async function GamePage({ gameMode, gameVariant }: { gameMode: GameMode; gameVariant?: string | string[] }) {
    const selectedVariant = Array.isArray(gameVariant) ? gameVariant[0] : gameVariant;

    if (!isGameVariant(selectedVariant)) {
        redirect(`/?game=${gameMode}`);
    }

    const session = await auth();

    if (!session?.user?.banchoId) {
        return <SignInPrompt />;
    }

    return <MenuManager gameMode={gameMode} gameVariant={selectedVariant} />;
}
