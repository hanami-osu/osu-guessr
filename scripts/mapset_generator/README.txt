Create mapsets.txt with one beatmapset URL per line:

https://osu.ppy.sh/beatmapsets/18#osu/2844649
https://osu.ppy.sh/beatmapsets/275#osu/4867605
https://osu.ppy.sh/beatmapsets/279#osu/4791387

Run ./mapsets_tags_generator.sh. Set OSU_API_KEY in the environment or in an
.env file in this directory. The import uses the application's Prisma database
configuration, so set DATABASE_URL in the repository's .env or in the shell.
