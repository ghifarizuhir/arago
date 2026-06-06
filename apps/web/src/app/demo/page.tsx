import { TopicStep } from "@/components/TopicStep";

export default function DemoPage() {
  const handleTopicSubmit = async (data: {
    topic: string;
    standardIds: string[];
  }) => {
    console.log("Topic step submitted with data:", data);
    // In a real app, this would:
    // 1. Save draft.topic = data.topic
    // 2. Save draft.standards = data.standardIds (array of UUIDs)
    // 3. Call the AI generation endpoint with standardIds
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Arago Assessment Creation Demo</h1>
          <p className="text-gray-600">
            This demonstrates the Topic step with SearchWithDropdown for standards selection.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-8">
          <TopicStep
            onNext={handleTopicSubmit}
            initialData={{
              topic: "",
              standardIds: [],
            }}
          />
        </div>

        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Implementation Details</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>
              ✓ <strong>GET /api/standards?q=</strong> - Searches standards by code, description, or subject
            </li>
            <li>
              ✓ <strong>SearchWithDropdown</strong> - Multi-select component with chips and real-time search
            </li>
            <li>
              ✓ <strong>TopicStep</strong> - Form that collects topic and standard UUIDs
            </li>
            <li>
              ✓ <strong>Integration ready</strong> - Returns standardIds array to be persisted in draft.standards
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
