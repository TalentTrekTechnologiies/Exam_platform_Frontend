// src/pages/admin/ExamSettings.jsx
import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout/Layout";
import Card, { CardBody } from "../../components/UI/Card";
import Button from "../../components/UI/Button";
import Input from "../../components/UI/Input";
import { useExam } from "../../contexts/ExamContext";

const ExamSettings = () => {
  const { examSettings, updateSettings } = useExam();
  const [settings, setSettings] = useState(examSettings);

  useEffect(() => {
    setSettings(examSettings);
  }, [examSettings]);

  const handleSave = () => {
    updateSettings(settings);
    alert("Settings saved successfully!");
  };

  return (
    <Layout title="Exam Configuration">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardBody className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Exam Duration</h3>
              <Input
                label="Duration (minutes)"
                type="number"
                value={settings.duration}
                onChange={(e) => setSettings({ ...settings, duration: parseInt(e.target.value) })}
                min="30"
                max="240"
              />
              <p className="text-xs text-gray-500 mt-1">Set the total time allowed for the exam</p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Question Configuration</h3>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Physics Questions"
                  type="number"
                  value={settings.physicsCount}
                  onChange={(e) => setSettings({ ...settings, physicsCount: parseInt(e.target.value) })}
                />
                <Input
                  label="Chemistry Questions"
                  type="number"
                  value={settings.chemistryCount}
                  onChange={(e) => setSettings({ ...settings, chemistryCount: parseInt(e.target.value) })}
                />
                <Input
                  label="Mathematics Questions"
                  type="number"
                  value={settings.mathsCount}
                  onChange={(e) => setSettings({ ...settings, mathsCount: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Marking Scheme</h3>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Marks per Correct Answer"
                  type="number"
                  value={settings.correctMark}
                  onChange={(e) => setSettings({ ...settings, correctMark: parseInt(e.target.value) })}
                />
                <Input
                  label="Negative Marking"
                  type="number"
                  value={settings.negativeMark}
                  onChange={(e) => setSettings({ ...settings, negativeMark: parseInt(e.target.value) })}
                  step="0.25"
                />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Exam Schedule</h3>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Start Date"
                  type="date"
                  value={settings.startDate}
                  onChange={(e) => setSettings({ ...settings, startDate: e.target.value })}
                />
                <Input
                  label="End Date"
                  type="date"
                  value={settings.endDate}
                  onChange={(e) => setSettings({ ...settings, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button onClick={handleSave} variant="primary" className="w-full">
                Save Configuration
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
};

export default ExamSettings;