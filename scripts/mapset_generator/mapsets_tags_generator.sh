#!/bin/bash
# How to use:
# Redefine `OSU_API_KEY` to be your osu! v1 API key.
# create a `mapsets.txt` file, and fill it with beatmapsets

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

TEMP_DIR="./tmp"
AUDIO_DIR="../../mapsets/audio"
BG_DIR="../../mapsets/backgrounds"
MAPSETS_CONFIG="./mapsets.txt"

if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

if [ ! -s "$MAPSETS_CONFIG" ] || [ -z "$OSU_API_KEY" ]; then
    echo "Set OSU_API_KEY and provide a nonempty $MAPSETS_CONFIG" >&2
    exit 1
fi

mkdir -p "$TEMP_DIR" "$AUDIO_DIR" "$BG_DIR"
IMPORT_FILE=$(mktemp "$TEMP_DIR/mapsets.XXXXXX") || exit 1
trap 'rm -f "$IMPORT_FILE"' EXIT

total_lines=$(awk 'END { print NR }' "$MAPSETS_CONFIG")
current_line=0

while IFS= read -r line || [ -n "$line" ]; do
    ((current_line++))
    progress=$((current_line * 100 / total_lines))

    if [[ $line =~ ([0-9]+) ]]; then
        mapset_id="${BASH_REMATCH[1]}"
        echo "[$progress%] Processing mapset ID: $mapset_id ($current_line/$total_lines)"

        rm -f "$AUDIO_DIR"/$mapset_id.* "$BG_DIR"/$mapset_id.*

        mapset_temp_dir="$TEMP_DIR/$mapset_id"
        mkdir -p "$mapset_temp_dir"

        echo "  Downloading beatmap..."
        # wget -q "https://api.nerinyan.moe/d/$mapset_id" -O "$mapset_temp_dir/$mapset_id.osz"
        # wget -q "https://beatconnect.io/b/$mapset_id" -O "$mapset_temp_dir/$mapset_id.osz"
        # wget -q "https://mirror.hinamizawa.ai/d/$mapset_id" -O "$mapset_temp_dir/$mapset_id.osz"
        wget -q "https://osu.direct/api/d/$mapset_id" -O "$mapset_temp_dir/$mapset_id.osz"
        # wget -q "https://catboy.best/d/$mapset_id" -O "$mapset_temp_dir/$mapset_id.osz"
        if [ ! -f "$mapset_temp_dir/$mapset_id.osz" ]; then
            echo "  Failed to download .osz file"
            rm -rf "$mapset_temp_dir"
            continue
        fi

        filesize=$(stat -f%z "$mapset_temp_dir/$mapset_id.osz" 2>/dev/null || stat -c%s "$mapset_temp_dir/$mapset_id.osz")
        if [ "$filesize" -eq 0 ]; then
            echo "  Downloaded file is empty"
            rm -rf "$mapset_temp_dir"
            continue
        fi

        echo "  Unzipping beatmap..."
        unzip -q "$mapset_temp_dir/$mapset_id.osz" -d "$mapset_temp_dir" || {
            echo "  Failed to unzip beatmap"
            rm -rf "$mapset_temp_dir"
            continue
        }

        largest_audio=$(find "$mapset_temp_dir" -type f \( -name "*.mp3" -o -name "*.ogg" \) -printf "%s %p\n" | sort -nr | head -1 | cut -d' ' -f2-)

        if [ -n "$largest_audio" ]; then
            audio_ext="${largest_audio##*.}"
            compressed_audio="$AUDIO_DIR/$mapset_id.$audio_ext"
            ffmpeg -i "$largest_audio" -b:a 96k "$compressed_audio" -y
            audio_filename="$mapset_id.$audio_ext"
            echo "  Audio file compressed and saved to: $compressed_audio"
        else
            echo "  No audio file found for mapset $mapset_id"
            continue
        fi

        echo "  Downloading background image..."
        wget -q "https://assets.ppy.sh/beatmaps/$mapset_id/covers/fullsize.jpg" -O "$BG_DIR/$mapset_id.jpg"
        if [ $? -eq 0 ]; then
            image_filename="$mapset_id.jpg"
            echo "  Background image downloaded to: $BG_DIR/$mapset_id.jpg"
        else
            echo "  Failed to download background image for mapset $mapset_id"
            continue
        fi

        echo "  Compressing background image..."
        compressed_image="$BG_DIR/$mapset_id.jpg"
        convert "$BG_DIR/$mapset_id.jpg" -resize 1280x720 -quality 75 "$compressed_image"
        if [ $? -eq 0 ]; then
            image_filename="$mapset_id.jpg"
            echo "  Background image compressed and saved to: $compressed_image"
        else
            echo "  Failed to compress background image for mapset $mapset_id"
            continue
        fi

        if ! curl -fsS "https://osu.ppy.sh/api/get_beatmaps?k=$OSU_API_KEY&s=$mapset_id" | jq -ce \
            --argjson id "$mapset_id" --arg image "$image_filename" --arg audio "$audio_filename" \
            '.[0] | select(.title != null and .artist != null and .creator != null)
             | {mapsetId: $id, title, artist, mapper: .creator, imageFilename: $image, audioFilename: $audio}' >>"$IMPORT_FILE"; then
            echo "  Could not load metadata for mapset $mapset_id" >&2
        fi

        rm -rf "$mapset_temp_dir"
    else
        echo "[$progress%] Could not extract mapset ID from line: $line"
    fi
done <"$MAPSETS_CONFIG"

if [ -s "$IMPORT_FILE" ]; then
    (cd "$SCRIPT_DIR/../.." && bun "$SCRIPT_DIR/save-mapsets.ts" "$SCRIPT_DIR/$IMPORT_FILE") || exit 1
fi
echo "Processing complete!"
