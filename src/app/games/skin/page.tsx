import { GameMode } from "@/actions/types";
import GamePage from "../shared/GamePage";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Skin Guessr",
    description: "Guess osu! skins from screenshots.",
};

export default function SkinGuessr() {
    return <GamePage gameMode={GameMode.Skin} />;
}
