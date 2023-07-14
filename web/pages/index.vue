<script setup lang="ts">
const config = useRuntimeConfig()
useHead({
  title: 'Cotrans Manga Image Translator by VoileLabs',
})

const languages = {
  CHS: '简体中文',
  CHT: '繁體中文',
  JPN: '日本語',
  ENG: 'English',
  KOR: '한국어',
  VIN: 'Tiếng Việt',
  CSY: 'čeština',
  NLD: 'Nederlands',
  FRA: 'français',
  DEU: 'Deutsch',
  HUN: 'magyar nyelv',
  ITA: 'italiano',
  PLK: 'polski',
  PTB: 'português',
  ROM: 'limba română',
  RUS: 'русский язык',
  ESP: 'español',
  TRK: 'Türk dili',
}
const language = useLocalStorage('trans_language', 'CHS')

const sizes = {
  S: '1024px',
  M: '1536px',
  L: '2048px',
  X: '2560px',
}
const size = ref('L')

const detectors = {
  default: 'Default',
  ctd: 'Comic Text Detector',
}
const detector = ref('default')

const directions = {
  default: 'Follow language',
  auto: 'Follow image',
  h: 'All horizontal',
  v: 'All vertical',
}
const direction = useSessionStorage('trans_direction', 'default')

const translators = {
  'none': 'Remove text',
  'gpt3.5': 'GPT-3.5',
  'youdao': 'Youdao',
  'baidu': 'Baidu',
  'google': 'Google',
  'deepl': 'DeepL',
  'papago': 'Papago',
  'offline': 'Sugoi / M2M100',
  'original': 'Untranslated',
}
const translator = useSessionStorage('trans_translator', 'gpt3.5')

const acceptTypes = ['image/png', 'image/jpeg', 'image/bmp', 'image/webp']
const file = shallowRef<File | null>(null)

function onDrop(e: DragEvent) {
  const f = e.dataTransfer?.files[0]
  if (f && acceptTypes.includes(f.type))
    file.value = f
}
function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f && acceptTypes.includes(f.type))
    file.value = f
}
useEventListener(document, 'paste', (e: ClipboardEvent) => {
  const f = e.clipboardData?.files[0]
  if (f && acceptTypes.includes(f.type))
    file.value = f
})

const fileUri = ref('')
watch(file, (file) => {
  if (fileUri.value)
    URL.revokeObjectURL(fileUri.value)
  fileUri.value = file ? URL.createObjectURL(file) : ''
})

interface TaskResult {
  translation_mask: string
}

interface QueryV1MessagePending {
  type: 'pending'
  pos: number
}
interface QueryV1MessageStatus {
  type: 'status'
  status: string
}
interface QueryV1MessageResult {
  type: 'result'
  result: TaskResult
}
interface QueryV1MessageError {
  type: 'error'
  error_id?: string | null
}
interface QueryV1MessageNotFound {
  type: 'not_found'
}
type QueryV1Message =
  | QueryV1MessagePending
  | QueryV1MessageStatus
  | QueryV1MessageResult
  | QueryV1MessageError
  | QueryV1MessageNotFound

const taskId = ref('')
const errorId = ref('')
const errorStatus = ref('')
const resultBlob = ref<Blob | null>(null)
const status = ref('')
async function upload() {
  if (!file.value)
    return

  errorId.value = ''
  errorStatus.value = ''
  resultBlob.value = null
  status.value = 'uploading'

  const formData = new FormData()
  formData.append('file', file.value)
  formData.append('mime', file.value.type)
  formData.append('target_language', language.value)
  formData.append('detector', detector.value)
  formData.append('direction', direction.value)
  formData.append('translator', translator.value)
  formData.append('size', size.value)

  const res = await $fetch<{
    id: string
    status: string
    result?: TaskResult | null
  }>(`${config.public.apiBase}/task/upload/v1`, {
    method: 'PUT',
    body: formData,
    onResponseError({ response }) {
      errorId.value = response._data
      errorStatus.value = `${response.status} ${response.statusText}\n${response._data}`
    },
    onRequestError({ error }) {
      errorStatus.value = error.toString()
    },
  })

  status.value = 'pending'
  taskId.value = res.id

  let result: TaskResult
  if (res.result) {
    result = res.result
  }
  else {
    const socket = new WebSocket(`${config.public.wsBase}/task/${taskId.value}/event/v1`)
    result = await new Promise<TaskResult>((resolve, reject) => {
      socket.addEventListener('message', (e) => {
        try {
          const data: QueryV1Message = JSON.parse(e.data)
          if (data.type === 'pending') {
            status.value = `pending (${data.pos} in queue)`
          }
          else if (data.type === 'status') {
            status.value = data.status
          }
          else if (data.type === 'result') {
            socket.close()
            resolve(data.result)
          }
          else if (data.type === 'error') {
            errorId.value = data.error_id ?? 'undefined'
            socket.close()
            reject()
          }
          else if (data.type === 'not_found') {
            errorId.value = 'not_found'
            socket.close()
            reject()
          }
        }
        catch (e) {
          console.error(e)
        }
      })
    })
    socket.close()
  }

  status.value = 'rendering'

  // layer translation_mask on top of original image
  const canvas = document.createElement('canvas')
  const canvasCtx = canvas.getContext('2d')!
  // draw original image
  const img = new Image()
  img.src = fileUri.value
  await new Promise((resolve) => {
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      canvasCtx.drawImage(img, 0, 0)
      resolve(null)
    }
  })
  // draw translation_mask
  const img2 = new Image()
  img2.src = result.translation_mask
  img2.crossOrigin = 'anonymous'
  await new Promise((resolve) => {
    img2.onload = () => {
      canvasCtx.drawImage(img2, 0, 0)
      resolve(null)
    }
  })

  canvas.toBlob((blob) => {
    resultBlob.value = blob
  }, 'image/png')
}

const resultUri = ref('')
watch(resultBlob, (blob) => {
  if (resultUri.value)
    URL.revokeObjectURL(resultUri.value)
  resultUri.value = blob ? URL.createObjectURL(blob) : ''
})

function saveAsPNG() {
  if (!resultUri.value || !taskId.value)
    return

  const a = document.createElement('a')
  a.href = resultUri.value
  a.download = `translation-${taskId}.png`
  a.classList.add('hidden')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function reset() {
  file.value = null
  taskId.value = ''
  errorId.value = ''
  errorStatus.value = ''
  resultBlob.value = null
  status.value = ''
}
</script>

<template>
  <div class="flex-1 flex justify-between items-center gap-6">
    <div class="flex-1 flex flex-col min-w-0 h-full">
      <label
        class="flex-1 rounded-2xl"
        @dragenter.prevent
        @dragover.prevent
        @dragleave.prevent
        @drop.prevent="onDrop"
      >
        <input
          type="file"
          :accept="acceptTypes.join(',')"
          class="hidden"
          @change="onFileChange"
        >

        <div class="grid place-items-center w-full h-full rounded-2xl text-zinc-800">
          <div
            v-if="resultUri"
            class="flex flex-col sm:flex-row items-center gap-8"
          >
            <img :src="resultUri" class="object-contain max-w-100vw sm:max-w-[calc(100vw-20rem)] sm:h-[calc(100vh-12rem)]">

            <div class="flex flex-col gap-4">
              <div class="flex items-center gap-1 text-lg">
                <div class="i-ri:check-line w-5 h-5" />
                Translation Finished
              </div>

              <button
                class="px-6 py-1 rounded-full text-fuchsia-600 border border-fuchsia-300"
                @click.prevent="saveAsPNG"
              >
                Save as PNG
              </button>

              <button
                class="px-6 py-1 rounded-full text-fuchsia-600 border border-fuchsia-300"
                @click.prevent="reset"
              >
                Try another one
              </button>
            </div>
          </div>

          <div
            v-else-if="errorId || errorStatus"
            class="flex flex-col items-center gap-4"
          >
            <div class="flex justify-center items-center gap-1 text-lg">
              <div class="i-ri:close-line w-5 h-5" />
              Oops!
            </div>

            <div class="flex flex-col items-center">
              We experienced an issue while translating your image.
              <div v-if="errorStatus" class="text-sm">{{ errorStatus }}</div>
              <div v-if="taskId" class="text-sm font-mono">Task ID: {{ taskId }}</div>
              <div v-if="errorId" class="text-sm font-mono">Error ID: {{ errorId }}</div>
            </div>

            <div>
              <button
                class="px-6 py-1 rounded-full text-fuchsia-600 border-2 border-fuchsia-300"
                @click.prevent="reset"
              >
                Try another one
              </button>
            </div>
          </div>

          <div
            v-else-if="status"
            class="flex flex-col items-center gap-4"
          >
            <div class="flex justify-center items-center gap-1 text-lg">
              <div class="i-ri:loader-4-line w-5 h-5 animate-spin" />
              Translating...
            </div>

            <div class="text-zinc-700">
              {{ status }}
            </div>
          </div>

          <div
            v-else-if="fileUri"
            class="flex flex-col sm:flex-row items-center gap-8"
          >
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-1 text-lg">
                <div class="i-ri:file-search-line w-5 h-5" />
                File Preview
              </div>

              <img :src="fileUri" class="object-contain max-w-100vw sm:max-w-[calc(100vw-20rem)] sm:h-[calc(100vh-12rem)]">
            </div>

            <div class="flex flex-col gap-2 pointer-events-none">
              <div class="flex items-center gap-1 text-lg">
                <div class="i-ri:settings-2-line w-5 h-5" />
                Options
              </div>

              <label class="pointer-events-auto">
                <span class="ml-2 text-sm">Language</span>
                <UListbox v-model="language" class="w-56" :items="languages" />
              </label>
              <label class="pointer-events-auto">
                <span class="ml-2 text-sm">Detection Resolution</span>
                <UListbox v-model="size" class="w-56" :items="sizes" />
              </label>
              <label class="pointer-events-auto">
                <span class="ml-2 text-sm">Text Detector</span>
                <UListbox v-model="detector" class="w-56" :items="detectors" />
              </label>
              <label class="pointer-events-auto">
                <span class="ml-2 text-sm">Text Direction</span>
                <UListbox v-model="direction" class="w-56" :items="directions" />
              </label>
              <label class="pointer-events-auto">
                <span class="ml-2 text-sm">Translator</span>
                <UListbox v-model="translator" class="w-56" :items="translators" />
                <div class="mt-1 ml-1 w-54 text-xs">
                  If GPT-3.5 can't process your image, try using other translators!
                </div>
              </label>

              <button
                class="py-1 w-56 text-center rounded-full text-fuchsia-600 border border-fuchsia-300 pointer-events-auto"
                @click.prevent="upload"
              >
                Translate
              </button>
            </div>
          </div>

          <div v-else class="flex items-center gap-2 max-w-80vw cursor-pointer">
            <i class="i-ri:image-add-line w-8 h-8 text-zinc-500" />
            Paste an image, click to select, or drag and drop
          </div>
        </div>
      </label>
    </div>
  </div>
</template>
