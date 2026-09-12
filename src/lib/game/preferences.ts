export const AUDIO_VOLUME_STORAGE_KEY = "osu-guessr:audio-volume";
export const AUDIO_AUTOPLAY_STORAGE_KEY = "osu-guessr:audio-autoplay";
export const SHORTCUTS_STORAGE_KEY = "osu-guessr:keyboard-shortcuts-open";

export const DEFAULT_AUDIO_VOLUME_PERCENT = 25;
export const DEFAULT_AUDIO_AUTOPLAY = true;

export function readAudioVolumePreference(storage: Pick<Storage, "getItem">) {
    const raw = storage.getItem(AUDIO_VOLUME_STORAGE_KEY);
    if (raw === null) return DEFAULT_AUDIO_VOLUME_PERCENT;

    const stored = Number(raw);
    if (!Number.isFinite(stored)) return DEFAULT_AUDIO_VOLUME_PERCENT;
    return Math.min(100, Math.max(0, stored));
}

export function readBooleanPreference(storage: Pick<Storage, "getItem">, key: string, fallback: boolean) {
    const stored = storage.getItem(key);
    if (stored === "true") return true;
    if (stored === "false") return false;
    return fallback;
}
