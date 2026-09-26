import BrandCharacterManager from "@/components/admin/BrandCharacterManager";

export const dynamic = "force-dynamic";

export default function AdminCreativeAiBrandCharacterPage() {
  return (
    <div className="min-h-screen bg-[#F5F1ED] p-6 md:p-8">
      <BrandCharacterManager />
    </div>
  );
}
