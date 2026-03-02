# Trait Extractor Tester

This is a lightweight Next.js application designed to test the new candidate trait vectorization extraction strategy (as defined in `001-bridge-traits-cubby`).

## Features
- **Drag & Drop**: Drop a `.txt` resume or paste raw text (from LinkedIn or a PDF).
- **AI Extraction**: Uses the Vercel AI SDK and `gpt-4o` to parse the text against the strict `TraitSignalSchema`.
- **Nuanced Signal Highlighting**: Specifically highlights the new traits discussed (Hard Things Done, Hackathons, Open Source, Company Signals).
- **Local Logging**: Save extraction results to a local `logs/` directory for review with the team.

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Copy `.env.example` to `.env.local` and add your OpenAI API key:
   ```bash
   cp .env.example .env.local
   # Edit .env.local to add OPENAI_API_KEY
   ```

3. **Run the Development Server**
   ```bash
   npm run dev
   ```

4. **Test Candidates**
   Open [http://localhost:3000](http://localhost:3000) in your browser. Paste in a few candidate resumes and review the extracted JSON. If the results look good, you can click "Log Result" to save the output to the `logs/` folder for your review with Fred and Sergey.
