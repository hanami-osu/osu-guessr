import { GameMode } from "@/actions/types";
import { auth } from "@/lib/auth";
import MenuManager from "./MenuManager";
import SignInPrompt from "./SignInPrompt";

export default async function GamePage({ gameMode }: { gameMode: GameMode }) {
    const session = await auth();

    if (!session?.user?.banchoId) {
        return <SignInPrompt />;
    }

    return <MenuManager gameMode={gameMode} />;
}
