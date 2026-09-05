import { GameMode } from "@/actions/types";
import GamePage from "../shared/GamePage";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Skin Guessr",
    description: "Test your knowledge of osu! skins by identifying them from screenshots.",
};

export default function SkinGuessr() {
    return <GamePage gameMode={GameMode.Skin} />;
}
