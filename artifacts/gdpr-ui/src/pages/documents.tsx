import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDocuments,
  useUploadDocument,
  useDeleteDocument,
  getListDocumentsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, Trash2, FileText, Loader2, File } from "lucide-react";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_LABELS: Record<string, string> = {
  dpia: "DPIA",
  policy: "Policy",
  other: "Other",
};

export default function Documents() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: docs, isLoading } = useListDocuments();
  const uploadDoc = useUploadDocument();
  const deleteDoc = useDeleteDocument();

  function handleUploadClick() {
    fileRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", file.name);
    formData.append("type", guessDocType(file.name));

    uploadDoc.mutate(
      { data: formData as unknown as { file: Blob } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
          if (fileRef.current) fileRef.current.value = "";
        },
      },
    );
  }

  function guessDocType(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes("dpia") || lower.includes("impact")) return "dpia";
    if (lower.includes("policy") || lower.includes("privacy")) return "policy";
    return "other";
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this document?")) return;
    deleteDoc.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
        },
      },
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3]">Documents</h1>
          <p className="text-sm text-[#8b949e] mt-1">
            Upload DPIA forms and privacy policies to compare against scan findings.
          </p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.doc"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            onClick={handleUploadClick}
            disabled={uploadDoc.isPending}
            className="bg-[#1f6feb] hover:bg-[#388bfd] text-white h-9 px-4 text-sm"
          >
            {uploadDoc.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Upload className="h-3.5 w-3.5 mr-1.5" />
            )}
            Upload
          </Button>
        </div>
      </div>

      {/* Drop zone hint */}
      <div
        className="border border-dashed border-[#30363d] rounded-lg px-6 py-5 text-center cursor-pointer hover:border-[#58a6ff]/50 transition-colors"
        onClick={handleUploadClick}
      >
        <File className="h-6 w-6 text-[#484f58] mx-auto mb-2" />
        <p className="text-sm text-[#8b949e]">Click to upload PDF, DOCX, or TXT</p>
        <p className="text-xs text-[#484f58] mt-1">Max 10 MB</p>
      </div>

      {/* Document list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 bg-[#161b22]" />
          ))}
        </div>
      ) : docs && docs.length > 0 ? (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg divide-y divide-[#21262d]">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-4 w-4 text-[#484f58] shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-[#c9d1d9] truncate">{doc.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] uppercase tracking-wider font-medium text-[#58a6ff] bg-[#58a6ff]/10 px-1.5 py-0.5 rounded">
                      {TYPE_LABELS[doc.type] ?? doc.type}
                    </span>
                    <span className="text-xs text-[#484f58]">{formatBytes(doc.sizeBytes)}</span>
                    <span className="text-xs text-[#484f58]">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(doc.id)}
                disabled={deleteDoc.isPending}
                className="text-[#8b949e] hover:text-[#f97583] hover:bg-[#3d1a1a]/50 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-6 py-10 text-center">
          <FileText className="h-8 w-8 text-[#30363d] mx-auto mb-3" />
          <p className="text-sm text-[#8b949e]">No documents uploaded yet.</p>
        </div>
      )}
    </div>
  );
}
