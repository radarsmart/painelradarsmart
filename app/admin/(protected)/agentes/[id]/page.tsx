"use client";

import { useParams } from "next/navigation";

import SalesAgentForm from "@/components/admin/SalesAgentForm";

export default function AdminEditarAgentePage() {
  const params = useParams<{ id: string }>();
  return <SalesAgentForm agentId={params.id} />;
}
