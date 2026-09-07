# Translating osu!guessr

Translations live in `src/messages/`, with one JSON file per language (e.g., `en.json` for English).

## Adding a New Language

1. Create a new file in `src/messages/` named `[language-code].json`
   - Use the standard two-letter language code (e.g., `fr.json` for French)
   - Copy the content from `en.json` as a starting point

2. Import the file and register its code and display name in the translation registry used by `src/hooks/use-translations.ts`.

3. Maintain the same structure as the English file, changing only text values.

## Translation Guidelines

1. **Keep Variables**: Preserve variables in curly braces:
   - `{osu_base}` → remains as is
   - `{count}` → remains as is
   - `{points}` → remains as is

2. **Wording**: Use direct descriptions and instructions. Avoid slogans and filler.

## Testing Your Translation

1. After adding your translation file, run the development server:
   ```bash
   bun run dev
   ```

2. Switch to your language using the language selector in the UI

3. Test all pages and features to ensure translations appear correctly

## Submitting Your Translation

1. Fork the repository
2. Create a new branch: `add-[language]-translation`
3. Add your translation file
4. Submit a Pull Request with:
   - The language you're adding
   - Any notes about regional variations
   - Your osu! username (optional, for credits)
   - A translation label

## Translation Status

Currently supported languages:
- English (en)
- Turkish (tr)
- Czech (cs)
- Spanish (es)
- Polish (pl)
- Russian (ru)

## Help

1. Open an issue with the "translation" label
2. Contact the maintainers on Discord
3. Check existing translations for examples
