import CharacterPackImporter from "@/components/admin/CharacterPackImporter";

export const dynamic = "force-dynamic";

export default function AdminCharacterPackImportPage() {
  return (
    <div className="min-h-screen bg-[#F5F1ED] p-6 md:p-8">
      <CharacterPackImporter />
    </div>
  );
}
