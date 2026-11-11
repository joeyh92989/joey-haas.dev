import raw from './intake-demo.json'
import { readRecording } from '../lib/intakeDemo.js'

/**
 * The public intake demo's recording, or null while the committed file is
 * still the `{"provisional": true}` placeholder. The file is only ever
 * `backend/scripts/record_intake_demo.py`'s output (see
 * backend/scripts/README.md); page tests mock this module.
 */
export const recording = readRecording(raw)
