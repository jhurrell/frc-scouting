# 08: Automatic Upload and the pending count

**What to build:** Complete Reports Upload without the Scout thinking about it: when a Report is completed while online, and when the connection comes back. "Upload now" is still there. The app always shows how many Reports are waiting. When an Upload fails (wrong access code, no connection, the script unreachable), the Scout sees a clear message and the Reports stay safely on the device to be retried.

See the spec: Uploading, user stories 34–38.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Completing a Report while online triggers an Upload.
- [ ] Regaining a connection triggers an Upload of everything pending.
- [ ] A pending count is visible from every screen.
- [ ] A failed Upload leaves every Report on the device, still pending, and shows a clear reason.
- [ ] Rejections for individual Reports are shown per Report and don't block the rest of the batch.
- [ ] Retrying after a partial failure never duplicates rows, because Uploads are idempotent.
- [ ] Core tests cover: automatic Upload on Complete, retry after a gateway failure, the pending count, and rejections for individual Reports, all using the fake gateway with simulated failures.
