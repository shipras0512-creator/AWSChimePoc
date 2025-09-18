const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  CreateAttendeeCommand,
  StartMeetingTranscriptionCommand,
  StopMeetingTranscriptionCommand,
} = require("@aws-sdk/client-chime-sdk-meetings");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ⚠️ Use ENV variables in production
const REGION = process.env.AWS_REGION || "us-east-1";
const client = new ChimeSDKMeetingsClient({
  region: REGION,
  credentials: {
    accessKeyId: "AKIAVSX4Z2562TXWV3OQ",     // <-- replace with env variable
    secretAccessKey: "3w903kW8TKPOxO355zm95QkOcJshUWRtJsTivNMz", // <-- replace with env variable
  },
});

// In-memory store for meetings (for optional cleanup)
let meetings = {};

// Create Meeting + Host attendee
app.post("/createMeeting", async (req, res) => {
  try {
    const externalMeetingId = `meeting-${Date.now()}`; // must not be null
    const meetingResponse = await client.send(
      new CreateMeetingCommand({
        ClientRequestToken: Date.now().toString(),
        MediaRegion: REGION,
        ExternalMeetingId: externalMeetingId,
      })
    );

    const meeting = meetingResponse.Meeting;
    meetings[meeting.MeetingId] = meeting; // optional store

    // Create host attendee
    const hostResponse = await client.send(
      new CreateAttendeeCommand({
        MeetingId: meeting.MeetingId,
        ExternalUserId: "host",
      })
    );

    const hostAttendee = hostResponse.Attendee;

    // Encode meeting + host attendee info into a URL-safe string
    const payload = { meeting, attendee: hostAttendee };
    const encoded = encodeURIComponent(JSON.stringify(payload));
    const joinUrl = `http://localhost:3001/join?data=${encoded}`;

    res.json({ meeting, attendee: hostAttendee, joinUrl });
  } catch (err) {
    console.error("Error creating meeting:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start Transcription
app.post("/startTranscription", async (req, res) => {
  try {
    const { meetingId } = req.body;
    if (!meetingId || !meetings[meetingId]) {
      return res.status(400).json({ error: "Meeting not found" });
    }

    const params = {
      MeetingId: meetingId,
      TranscriptionConfiguration: {
        EngineTranscribeSettings: {
          LanguageCode: "en-US",
          VocabularyFilterMethod: "remove",
          Region: REGION,
        },
      },
    };

    const response = await client.send(new StartMeetingTranscriptionCommand(params));
    res.json({ message: "Transcription started", response });
  } catch (err) {
    console.error("Error starting transcription:", err);
    res.status(500).json({ error: err.message });
  }
});

// Stop Transcription
app.post("/stopTranscription", async (req, res) => {
  try {
    const { meetingId } = req.body;
    if (!meetingId || !meetings[meetingId]) {
      return res.status(400).json({ error: "Meeting not found" });
    }

    const response = await client.send(
      new StopMeetingTranscriptionCommand({ MeetingId: meetingId })
    );
    res.json({ message: "Transcription stopped", response });
  } catch (err) {
    console.error("Error stopping transcription:", err);
    res.status(500).json({ error: err.message });
  }
});

// End Meeting
app.post("/endMeeting", (req, res) => {
  const { meetingId } = req.body;
  if (meetingId && meetings[meetingId]) {
    delete meetings[meetingId];
  }
  res.json({ message: "Meeting ended" });
});
// Join Meeting + Attendee
app.post("/joinMeeting", async (req, res) => {
  try {
    const { meetingId, name } = req.body;
   /*  if (!meetings[meetingId]) {
      return res.status(404).json({ error: "Meeting not found" });
    } */
 
    const attendeeResponse = await client.send(
      new CreateAttendeeCommand({
        MeetingId: meetingId,
        ExternalUserId: name,
      })
    );
 
    res.json({
      meeting: meetings[meetingId],
      attendee: attendeeResponse.Attendee,
    });
  } catch (err) {
    console.error("Error joining meeting:", err);
    res.status(500).json({ error: err.message });
  }
});
 
// Start server
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`✅ AWS Chime Server running on port ${port}`)
);
