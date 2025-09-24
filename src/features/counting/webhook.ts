interface WebhookPayload {
  content: string;
  username?: string;
  avatar_url?: string;
  allowed_mentions?: { parse: string[] };
}

export async function relayCountingMessage(
  webhookUrl: string,
  payload: WebhookPayload
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Webhook responded with status ${response.status}: ${errorText.slice(0, 200)}`);
  }
}
