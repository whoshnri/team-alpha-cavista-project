
import { runNimi } from "./src/ai/graph.js";
import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.GROQ_API_KEY;

if (!API_KEY) {
    console.error("GROQ_API_KEY not found in .env");
    process.exit(1);
}

const mockVisionResult = {
    "success": true,
    "type": "fundus_screening",
    "processingTimeMs": 17742,
    "screening": {
        "imageQuality": "POOR",
        "qualityNote": "The provided image is a selfie of a person's face, not a retinal fundus image. Therefore, a proper analysis of the retina cannot be performed.",
        "mediaType": "fundus",
        "findings": [],
        "riskIndicators": {
            "hypertensiveRetinopathy": { "risk": "LOW" },
            "diabeticRetinopathy": { "risk": "LOW" },
            "glaucomaIndicators": { "risk": "LOW" },
            "macularAbnormality": { "risk": "LOW" }
        },
        "overallRisk": "LOW",
        "summary": "We were unable to assess your eye health from the image provided. The image appears to be a selfie of your face, not a specialized scan of your retina. To properly evaluate your eye health and potential vision issues, a correct retinal fundus image is required.",
        "recommendations": ["Please provide a clear retinal fundus image"],
        "urgency": "ROUTINE"
    },
    "pipeline": {
        "backtrackLog": [
            {
                "trigger": "content_type_mismatch",
                "from": "expected_fundus",
                "to": "detected_face",
                "reasoning": "User requested fundus analysis but image appears to be: face. A person's face, with a focus on the eyes. The eyes appear red."
            }
        ]
    }
};

async function verify() {
    console.log("Running verification with mock vision result...");

    const result = await runNimi({
        message: "Vision scan complete.",
        chatHistory: [],
        userProfile: { age: 45, gender: "Male" },
        toolResults: [],
        visionResult: mockVisionResult,
        apiKey: API_KEY!
    });

    console.log("\n--- AI Response ---");
    console.log(result.response);
    console.log("-------------------\n");

    if (result.response.toLowerCase().includes("face") || result.response.toLowerCase().includes("retina")) {
        console.log("Verification SUCCESS: AI correctly identified the reason for failure.");
    } else {
        console.log("Verification FAILED: AI did not mention the failure reason.");
    }
}

verify().catch(console.error);
