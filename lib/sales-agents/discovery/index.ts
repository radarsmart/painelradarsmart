import type { SalesAgent, DiscoveryCandidate, SalesAgentSource } from "../types";
import { discoverAwin } from "./awin";
import { discoverLomadee } from "./lomadee";
import { discoverShopee } from "./shopee";
import { discoverAmazon } from "./amazon";
import { discoverMercadoLivre } from "./mercadolivre";

const DISCOVERERS: Record<SalesAgentSource, (agent: SalesAgent) => Promise<DiscoveryCandidate[]>> = {
  awin: discoverAwin,
  lomadee: discoverLomadee,
  shopee: discoverShopee,
  amazon: discoverAmazon,
  mercadolivre: discoverMercadoLivre,
};

export async function discoverForAgent(agent: SalesAgent): Promise<DiscoveryCandidate[]> {
  const discoverer = DISCOVERERS[agent.source];
  if (!discoverer) {
    throw new Error(`Loja nao suportada: ${agent.source}`);
  }
  return discoverer(agent);
}
