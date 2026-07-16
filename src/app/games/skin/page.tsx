import { auth } from "@/lib/auth";
import SignInPrompt from "../shared/SignInPrompt";
import PreGameMenu from "./pages/PreGameMenu";
import GameScreen from "./pages/GameScreen";
import MenuManager from "../shared/MenuManager";

import { Metadata } from "next";
import { getInteractiveAuthProvider } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Skin Guessr",
    description: "Test your knowledge of osu! skins by identifying them from screenshots.",
};

export default async function SkinGuessr() {
    const session = await auth();

    if (!session?.user?.banchoId) {
        return <SignInPrompt authProvider={getInteractiveAuthProvider()} />;
    }
    return <MenuManager PreGameMenu={PreGameMenu} GameScreen={GameScreen} />;
}
