"use server";

import { authenticatedAction } from "./server";
import { getRandomAudio, getRandomBackground, getRandomSkin } from "@/lib/game/mapsets";

export async function getRandomAudioAction(sessionId?: string) {
    return authenticatedAction(() => getRandomAudio(sessionId));
}

export async function getRandomBackgroundAction(sessionId?: string) {
    return authenticatedAction(() => getRandomBackground(sessionId));
}

export async function getRandomSkinAction(sessionId?: string) {
    return authenticatedAction(() => getRandomSkin(sessionId));
}
