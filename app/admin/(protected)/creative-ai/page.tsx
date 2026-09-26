import CreativeAiDashboard from "@/components/admin/CreativeAiDashboard";

export const dynamic = "force-dynamic";

export default function AdminCreativeAiPage() {
  return (
    <div className="min-h-screen bg-[#F5F1ED] p-6 md:p-8">
      <CreativeAiDashboard />
    </div>
  );
}
