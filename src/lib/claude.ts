import { createServerFn } from "@tanstack/react-start";

export interface CheckinInput {
  mental_load: string;
  calm_level: string;
  blocker: string;
  immediate_need: string;
}

export interface ClaudeResult {
  state_label: string;
  explanation: string;
  micro_action: string;
  load_score: number;
}

export const analyzeCheckin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as CheckinInput)
  .handler(async (ctx) => {
    const data = ctx.data;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const prompt = `Tu es un coach mental bienveillant. Analyse cet état et réponds UNIQUEMENT avec un JSON valide — aucun texte autour, pas de markdown.

Données :
- Charge mentale : ${data.mental_load}
- Niveau de calme : ${data.calm_level}
- Principal blocage : ${data.blocker}
- Besoin immédiat : ${data.immediate_need}

Réponds avec exactement ce JSON (valeurs en français) :
{"state_label":"[étiquette courte de l'état, ex: Surcharge cognitive]","explanation":"[2 phrases bienveillantes et directes sur l'état]","micro_action":"[1 action concrète de 30-90 secondes, commençant par un verbe]","load_score":[entier de 1 à 10]}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API ${response.status}: ${errText}`);
    }

    const json = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };
    const text = json.content[0]?.text?.trim() ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Réponse Claude inattendue : ${text.slice(0, 120)}`);

    const result = JSON.parse(match[0]) as ClaudeResult;
    result.load_score = Math.max(1, Math.min(10, Number(result.load_score) || 5));
    return result;
  });
