import React, { useState } from "react";
import { API_BASE } from "../../lib/api";

export default function StudentUpload() {
  const [file, setFile] = useState(null);
  const [examId, setExamId] = useState("");
  const [slotId, setSlotId] = useState("");

  const handleUpload = async () => {
    if (!file || !examId || !slotId) {
      alert("Please fill all fields");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("examId", examId);
    formData.append("slotId", slotId);

    try {
      const res = await fetch(`${API_BASE}/admin/students/upload`, {
        method: "POST",
        body: formData
      });

      const report = await res.json();

      if (!res.ok) {
        alert(report.message || "Upload failed");
        return;
      }

      let message = report.summary;
      if (report.errors?.length) {
        message += "\n\nRejected rows:\n" + report.errors
          .slice(0, 15)
          .map((e) => `  Line ${e.line}: ${e.reason}`)
          .join("\n");
      }
      alert(message);
    } catch (err) {
      console.error(err);
      alert("Upload failed — could not reach the server.");
    }
  };

  return (
    <div style={{ padding: "30px" }}>
      <h2>Upload Students</h2>

      <div style={{ marginBottom: "10px" }}>
        <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      </div>

      <div style={{ marginBottom: "10px" }}>
        <input
          type="number"
          placeholder="Exam ID"
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: "10px" }}>
        <input
          type="number"
          placeholder="Slot ID"
          value={slotId}
          onChange={(e) => setSlotId(e.target.value)}
        />
      </div>

      <button onClick={handleUpload}>Upload Students</button>
    </div>
  );
}