<script setup lang="ts">
const config = useRuntimeConfig()

const visibility = useDocumentVisibility()
const { counter, pause, resume } = useInterval(15 * 1000, { controls: true })
watchEffect(() => {
  if (visibility.value === 'hidden') {
    pause()
  }
  else {
    counter.value++
    resume()
  }
})

const { data: status } = useFetch<{
  mit_worker: {
    processing: number
    queue: number
    gc_queue: number
    workers: number
  }
}>('/status/v1', {
  baseURL: config.public.apiBase,
  watch: [counter],
  lazy: true,
})
</script>

<template>
  <footer class="mx-1 font-quicksand">
    <div class="flex justify-between items-center gap-x-4 text-sm text-zinc-700">
      <div class="flex flex-wrap items-center gap-x-4">
        <span class="flex-shrink-0">
          &copy; 2021-2023 VoileLabs.
          <a
            href="https://choosealicense.com/licenses/gpl-3.0/"
            target="_blank" rel="noopener noreferrer"
          >
            GPL-3.0.
          </a>
        </span>
        <a
          class="flex-shrink-0"
          href="https://ko-fi.com/voilelabs"
          target="_blank" rel="noopener noreferrer"
        >
          Ko-fi
        </a>
        <a
          class="flex-shrink-0"
          href="https://patreon.com/voilelabs"
          target="_blank" rel="noopener noreferrer"
        >
          Patreon
        </a>
        <a
          class="flex-shrink-0"
          href="https://afdian.net/@voilelabs"
          target="_blank" rel="noopener noreferrer"
        >
          Afdian
        </a>
        <a
          class="flex-shrink-0"
          href="https://github.com/VoileLabs/cotrans"
          target="_blank" rel="noopener noreferrer"
        >
          Github
        </a>
        <a
          class="flex-shrink-0"
          href="https://discord.gg/975FRV8ca6"
          target="_blank" rel="noopener noreferrer"
        >
          Discord
        </a>
      </div>

      <div v-if="status" class="hidden lg:block">
        {{ status.mit_worker.workers }} workers
        processing {{ status.mit_worker.processing }} images
        with {{ status.mit_worker.queue }} queued
        + {{ status.mit_worker.gc_queue }} low priority
      </div>
    </div>
  </footer>
</template>
