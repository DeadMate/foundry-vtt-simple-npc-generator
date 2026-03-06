/**
 * Shared actor creation pipeline for generated and imported NPC flows
 * @module actor-pipeline
 */

function isActorDataPayload(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getActorCreateBatchSize(total, preferredBatchSize = 25) {
  const count = Math.max(1, Number(total) || 1);
  const safePreferred = Math.max(1, Math.min(50, Number(preferredBatchSize) || 25));
  return Math.max(1, Math.min(safePreferred, count));
}

async function createActorsInBatches(actorDataList, { chunkSize = 25, onProgress } = {}) {
  const list = Array.isArray(actorDataList) ? actorDataList : [];
  const indexed = [];
  for (let index = 0; index < list.length; index++) {
    if (!isActorDataPayload(list[index])) continue;
    indexed.push({ index, actorData: list[index] });
  }

  const out = new Array(list.length).fill(null);
  if (!indexed.length) {
    return {
      created: out,
      createdCount: 0,
      totalValid: 0,
      skippedCount: list.length
    };
  }

  const batchSize = Math.max(1, Math.min(50, Number(chunkSize) || 25));
  let createdCount = 0;
  for (let start = 0; start < indexed.length; start += batchSize) {
    const chunk = indexed.slice(start, start + batchSize);
    const payload = chunk.map((entry) => entry.actorData);
    let createdChunk = [];

    if (typeof Actor.createDocuments === "function") {
      try {
        createdChunk = await Actor.createDocuments(payload);
      } catch (err) {
        console.warn("NPC Button: Batch Actor.createDocuments failed, falling back to per-actor create.", err);
        createdChunk = await Promise.all(
          payload.map(async (actorData) => {
            try {
              return await Actor.create(actorData);
            } catch (createErr) {
              console.warn("NPC Button: Actor.create failed for one entry.", createErr);
              return null;
            }
          })
        );
      }
    } else {
      createdChunk = await Promise.all(
        payload.map(async (actorData) => {
          try {
            return await Actor.create(actorData);
          } catch (err) {
            console.warn("NPC Button: Actor.create failed for one entry.", err);
            return null;
          }
        })
      );
    }

    for (let index = 0; index < chunk.length; index++) {
      out[chunk[index].index] = createdChunk?.[index] || null;
    }
    createdCount += createdChunk.filter(Boolean).length;
    if (typeof onProgress === "function") {
      onProgress(Math.min(createdCount, indexed.length), indexed.length);
    }
  }

  return {
    created: out,
    createdCount,
    totalValid: indexed.length,
    skippedCount: Math.max(0, list.length - indexed.length)
  };
}

export async function runActorCreationPipeline({
  actorDataList,
  speciesEntries = [],
  createProgressLabel,
  speciesProgressLabel,
  skippedWarnKey = "ui.warnSkippedInvalidActorData",
  skippedWarnFallback = "",
  failedWarnKey = "ui.warnCreateNpcPartial",
  failedWarnFallback = "",
  speciesWarnKey = "",
  preferredBatchSize = 25,
  createProgressReporter,
  i18nText,
  i18nFormat,
  notifyWarn,
  applySpeciesToActor
} = {}) {
  const list = Array.isArray(actorDataList) ? actorDataList : [];
  const speciesByIndex = Array.isArray(speciesEntries) ? speciesEntries : [];
  const fallbackText = typeof i18nText === "function"
    ? i18nText
    : (_key, fallback = "") => String(fallback || "");
  const fallbackFormat = typeof i18nFormat === "function"
    ? i18nFormat
    : (_key, _data = {}, fallback = "") => String(fallback || "");
  const warn = typeof notifyWarn === "function"
    ? notifyWarn
    : (text) => ui.notifications?.warn?.(text);
  const progressFactory = typeof createProgressReporter === "function"
    ? createProgressReporter
    : () => ({ tick: () => {}, set: () => {}, finish: () => {} });

  const createProgress = progressFactory({
    label: String(createProgressLabel || "").trim(),
    total: list.filter((entry) => isActorDataPayload(entry)).length
  });
  const {
    created,
    createdCount,
    skippedCount
  } = await createActorsInBatches(list, {
    chunkSize: getActorCreateBatchSize(list.length, preferredBatchSize),
    onProgress: (done) => createProgress.set(done)
  });
  createProgress.finish();
  const createdActors = (created || []).filter(Boolean);

  if (skippedCount) {
    warn(
      fallbackFormat(
        skippedWarnKey,
        { count: skippedCount },
        skippedWarnFallback
      )
    );
  }
  if (!createdActors.length) {
    warn(fallbackText("ui.warnNoActorsCreated", "No NPC actors were created."));
    return {
      created,
      createdActors,
      skippedCount,
      failedCreateCount: Math.max(0, list.length - skippedCount - createdCount),
      speciesApplyErrors: 0
    };
  }

  const failedCreateCount = Math.max(0, list.length - skippedCount - createdCount);
  if (failedCreateCount > 0) {
    warn(
      fallbackFormat(
        failedWarnKey,
        { count: failedCreateCount },
        failedWarnFallback
      )
    );
  }

  const pairs = list.map((_, index) => ({
    actor: created?.[index] || null,
    speciesEntry: speciesByIndex[index] || null
  }));
  const speciesTargets = pairs.filter((entry) => entry.actor && entry.speciesEntry);
  const speciesProgress = progressFactory({
    label: String(speciesProgressLabel || "").trim(),
    total: speciesTargets.length
  });
  let speciesApplyErrors = 0;
  for (const pair of speciesTargets) {
    const actor = pair.actor;
    const speciesEntry = pair.speciesEntry;
    try {
      if (typeof applySpeciesToActor === "function") {
        await applySpeciesToActor(actor, speciesEntry);
      }
    } catch (err) {
      speciesApplyErrors += 1;
      console.warn(`NPC Button: Failed to apply species data for actor "${actor?.name || "Unknown"}".`, err);
    } finally {
      speciesProgress.tick();
    }
  }
  speciesProgress.finish();

  if (speciesWarnKey && speciesApplyErrors) {
    warn(
      fallbackFormat(speciesWarnKey, { count: speciesApplyErrors })
    );
  }

  return {
    created,
    createdActors,
    skippedCount,
    failedCreateCount,
    speciesApplyErrors
  };
}
