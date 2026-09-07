#!/bin/bash
# How to use:
# Redefine `OSU_API_KEY` to be your osu! v1 API key.
# create a `mapsets.txt` file, and fill it with beatmapsets

TEMP_DIR="./tmp"
AUDIO_DIR="../../mapsets/audio"
BG_DIR="../../mapsets/backgrounds"
MAPSET_TAGS_SQL="./mapset_tags.sql"
MAPSET_DATA_SQL="./mapset_data.sql"
MAPSETS_CONFIG="./mapsets.txt"

set -a
source .env
set +a

mkdir -p "$TEMP_DIR" "$AUDIO_DIR" "$BG_DIR"

echo "SET FOREIGN_KEY_CHECKS = 0;" >"$MAPSET_TAGS_SQL"
echo "REPLACE INTO mapset_tags (mapset_id, image_filename, audio_filename) VALUES" >>"$MAPSET_TAGS_SQL"

echo "SET FOREIGN_KEY_CHECKS = 0;" >"$MAPSET_DATA_SQL"
echo "REPLACE INTO mapset_data (mapset_id, title, artist, mapper) VALUES" >>"$MAPSET_DATA_SQL"

total_lines=$(wc -l <mapsets.txt)
current_line=0

while IFS= read -r line; do
    progress=$((current_line * 100 / total_lines))

    if [[ $line =~ ([0-9]+) ]]; then
        mapset_id="${BASH_REMATCH[1]}"
        echo "[$progress%] Processing mapset ID: $mapset_id ($current_line/$total_lines)"

        rm -f "$AUDIO_DIR"/$mapset_id.* "$BG_DIR"/$mapset_id.*

        mapset_temp_dir="$TEMP_DIR/$mapset_id"
        mkdir -p "$mapset_temp_dir"

        echo "  Downloading beatmap..."
        # wget -q "https://api.nerinyan.moe/d/$mapset_id" -O "$mapset_temp_dir/$mapset_id.osz"
        wget -q "https://beatconnect.io/b/$mapset_id" -O "$mapset_temp_dir/$mapset_id.osz"

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

        beatmap_data=$(curl -s "https://osu.ppy.sh/api/get_beatmaps?k=$OSU_API_KEY&s=$mapset_id")
        title=$(echo "$beatmap_data" | jq -r '.[0].title')
        artist=$(echo "$beatmap_data" | jq -r '.[0].artist')
        mapper=$(echo "$beatmap_data" | jq -r '.[0].creator')

        echo "    ($mapset_id, '$image_filename', '$audio_filename')," >>"$MAPSET_TAGS_SQL"
        echo "    ($mapset_id, '$(echo $title | sed "s/'/''/g")', '$(echo $artist | sed "s/'/''/g")', '$(echo $mapper | sed "s/'/''/g")')," >>"$MAPSET_DATA_SQL"

        rm -rf "$mapset_temp_dir"
    else
        echo "[$progress%] Could not extract mapset ID from line: $line"
    fi
    ((current_line++))
done <"mapsets.txt"

sed -i '$ s/,$/;/' "$MAPSET_TAGS_SQL"
sed -i '$ s/,$/;/' "$MAPSET_DATA_SQL"

echo "SET FOREIGN_KEY_CHECKS = 1;" >>"$MAPSET_TAGS_SQL"
echo "SET FOREIGN_KEY_CHECKS = 1;" >>"$MAPSET_DATA_SQL"

mariadb -p osu_guessr <mapset_data.sql
mariadb -p osu_guessr <mapset_tags.sql

echo "Processing complete!"
