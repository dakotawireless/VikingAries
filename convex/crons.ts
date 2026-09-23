import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';
const crons = cronJobs();
crons.interval('Expire abandoned executions without replay', { seconds: 30 }, internal.jobs.reconcileJobs, {});
export default crons;
