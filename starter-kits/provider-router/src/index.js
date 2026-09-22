const providers = [
  {
    id: "fast-text",
    capabilities: ["text"],
    healthy: true,
    cost: 1,
    latency: 1,
    async run(input) {
      return { provider: this.id, output: input.toUpperCase() };
    },
  },
  {
    id: "quality-text",
    capabilities: ["text", "reasoning"],
    healthy: true,
    cost: 3,
    latency: 2,
    async run(input) {
      return { provider: this.id, output: `Reasoned: ${input}` };
    },
  },
  {
    id: "offline-provider",
    capabilities: ["text", "reasoning"],
    healthy: false,
    cost: 1,
    latency: 1,
    async run() {
      throw new Error("offline");
    },
  },
];

function candidates(capability) {
  return providers
    .filter((p) => p.healthy && p.capabilities.includes(capability))
    .sort((a, b) => (a.cost + a.latency) - (b.cost + b.latency));
}

async function route({ capability, input }) {
  const ordered = candidates(capability);
  if (!ordered.length) throw new Error("no_eligible_provider");

  const failures = [];
  for (const provider of ordered) {
    try {
      return await provider.run(input);
    } catch (error) {
      failures.push({ provider: provider.id, error: error.message });
    }
  }
  throw new Error(`all_providers_failed: ${JSON.stringify(failures)}`);
}

console.log(await route({ capability: "text", input: "hello builder" }));
console.log(await route({ capability: "reasoning", input: "compare two approaches" }));
