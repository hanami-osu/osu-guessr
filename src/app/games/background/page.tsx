import { auth } from "@/lib/auth";

import SignInPrompt from "../shared/SignInPrompt";
import MenuManager from "../shared/MenuManager";
import PreGameMenu from "./pages/PreGameMenu";
import GameScreen from "./pages/GameScreen";

import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Background Guessr",
    description: "Test your knowledge by guessing songs from their beatmap backgrounds.",
};

export default async function BackgroundGuesser() {
    const session = await auth();

    if (!session?.user?.banchoId) {
        return <SignInPrompt />;
    }

    return <MenuManager PreGameMenu={PreGameMenu} GameScreen={GameScreen} />;
}
