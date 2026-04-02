const JIRA_TICKET_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/g

export function extractJiraTickets(commitMessages: string[]): string[] {
  const tickets = new Set<string>()

  for (const message of commitMessages) {
    for (const match of message.matchAll(JIRA_TICKET_PATTERN)) {
      tickets.add(match[1])
    }
  }

  return [...tickets]
}

export function buildJiraSection(tickets: string[], jiraBaseUrl?: string): string {
  if (tickets.length === 0) {
    return ''
  }

  const normalizedBaseUrl = jiraBaseUrl?.trim().replace(/\/+$/, '')
  const lines = tickets.map(ticket => {
    if (!normalizedBaseUrl) {
      return `- ${ticket}`
    }

    return `- [${ticket}](${normalizedBaseUrl}/browse/${ticket})`
  })

  return `## Related Issues\n${lines.join('\n')}`
}
