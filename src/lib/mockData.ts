/**
 * mockData.ts
 * -----------------------------------------------------------------------------
 * Seed raw intake documents across several channels. These feed the demo inbox
 * so the workspace is fully functional with zero backend / no API keys.
 * -----------------------------------------------------------------------------
 */

import type { RawCase } from "@/types/pvCase";

export const MOCK_RAW_CASES: RawCase[] = [
  {
    id: "CASE-2026-0417",
    worldwideId: "US-PVCOPILOT-2026-0417",
    channel: "patient_email",
    receivedAt: "2026-09-28T08:14:00Z",
    subject: "Side effects from my new blood pressure pills",
    sourceText: `Hi, I'm a 58 year old woman (initials M.R.) and I started taking Cardizem 120 mg once daily for my high blood pressure about two weeks ago.

Since 2026-09-20 I've had a really bad throbbing headache almost every day, and yesterday I felt very dizzy and nauseous. This morning it got so bad I nearly fainted. My daughter drove me to the hospital and I was admitted overnight for observation.

Please let me know if I should stop the medication. You can reach me at m.reynolds@example.com or on +1 415 555 0132.

Thanks, Mary`,
  },
  {
    id: "CASE-2026-0418",
    worldwideId: "US-PVCOPILOT-2026-0418",
    channel: "hcp_note",
    receivedAt: "2026-09-28T10:02:00Z",
    subject: "Suspected ADR — atorvastatin",
    sourceText: `Clinical note. Reporter: Dr. Alan Whitfield (consultant cardiologist), contact clinic@cardiocare.example.

Patient: 64 y/o male, initials J.K., prescribed atorvastatin 40 mg nightly for high cholesterol. Two weeks after starting, patient developed severe muscle pain and marked fatigue. No hospitalisation. Advised to discontinue; symptoms recovering. Reaction onset 15th September 2026.`,
  },
  {
    id: "CASE-2026-0419",
    worldwideId: "US-PVCOPILOT-2026-0419",
    channel: "call_center",
    receivedAt: "2026-09-29T13:47:00Z",
    subject: "Call transcript — allergic reaction",
    sourceText: `[Call center transcript]

Agent: Thank you for calling drug safety, how can I help?
Caller: Yes, I'm calling about my husband. He's 71, his initials are R.T. He took amoxicillin 500 mg three times a day for a chest infection.
Agent: And what happened?
Caller: About an hour after the second dose he came out in hives all over, his lips and tongue started swelling and he had real trouble breathing. It was life-threatening, honestly. The paramedics said it was anaphylaxis. He's in the ICU now.
Agent: I'm so sorry. Can I take a contact number?
Caller: Yes, it's 0207 555 0199.`,
  },
  {
    id: "CASE-2026-0420",
    worldwideId: "GB-PVCOPILOT-2026-0420",
    channel: "literature",
    receivedAt: "2026-09-29T16:20:00Z",
    subject: "Case report — sertraline and palpitations",
    sourceText: `Published case report (J. Clin. Pharm., 2026). A 29-year-old female patient was prescribed sertraline 50 mg once daily for depression. Following dose initiation the patient reported new-onset palpitations and insomnia. The events were considered medically significant and required treatment. Outcome: recovering. Corresponding author: Dr. Priya Nair.`,
  },
  {
    id: "CASE-2026-0421",
    worldwideId: "US-PVCOPILOT-2026-0421",
    channel: "web_form",
    receivedAt: "2026-09-30T07:05:00Z",
    subject: "Web form — incomplete report",
    sourceText: `I had a rash and some itching after taking my medication. Not sure of the exact name of the drug. It cleared up after a couple of days.`,
  },
];
