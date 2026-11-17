import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Uploads that never made it onto a listing (rejected, replaced or abandoned).
crons.hourly("clean orphan uploads", { minuteUTC: 17 }, internal.tools.cleanOrphanUploads);

export default crons;
