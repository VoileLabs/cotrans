<script setup lang="ts">
const config = useRuntimeConfig()

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
const language = $ref('CHS')

const sizes = {
  S: '1024px',
  M: '1536px',
  L: '2048px',
  X: '2560px',
}
const size = $ref('L')

const detectors = {
  default: 'Default',
  ctd: 'Comic Text Detector',
}
const detector = $ref('default')

const directions = {
  default: 'Follow language',
  auto: 'Follow image',
  h: 'All horizontal',
  v: 'All vertical',
}
const direction = $ref('default')

const translators = {
  youdao: 'Youdao',
  baidu: 'Baidu',
  google: 'Google',
  deepl: 'DeepL',
  papago: 'Papago',
  offline: 'Offline',
  none: 'None',
  original: 'Original',
}
const translator = $ref('youdao')

const acceptTypes = ['image/png', 'image/jpeg', 'image/bmp', 'image/webp']
let file = $shallowRef<File | null>(null)

const onDrop = (e: DragEvent) => {
  const f = e.dataTransfer?.files[0]
  if (f && acceptTypes.includes(f.type))
    file = f
}
const onFileChange = (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f && acceptTypes.includes(f.type))
    file = f
}
useEventListener(document, 'paste', (e: ClipboardEvent) => {
  const f = e.clipboardData?.files[0]
  if (f && acceptTypes.includes(f.type))
    file = f
})

let fileUri = $ref('')
watch($$(file), (file) => {
  if (fileUri)
    URL.revokeObjectURL(fileUri)
  fileUri = file ? URL.createObjectURL(file) : ''
})

interface TaskResult {
  translation_mask: string
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
  | QueryV1MessageStatus
  | QueryV1MessageResult
  | QueryV1MessageError
  | QueryV1MessageNotFound

let taskId = $ref('')
let errorId = $ref('')
let errorStatus = $ref('')
let resultBlob = $ref<Blob | null>(null)
let status = $ref('')
const upload = async () => {
  if (!file)
    return

  errorId = ''
  resultBlob = null
  status = 'uploading'

  const formData = new FormData()
  formData.append('file', file)
  formData.append('mime', file.type)
  formData.append('target_language', language)
  formData.append('detector', detector)
  formData.append('direction', direction)
  formData.append('translator', translator)
  formData.append('size', size)

  const res = await $fetch<{
    id: string
    status: string
    result?: TaskResult | null
  }>(`${config.public.apiBase}/task/upload/v1`, {
    method: 'PUT',
    body: formData,
    onResponseError({ response }) {
      errorId = response._data
      errorStatus = `${response.status} ${response.statusText}`
    },
  })

  status = 'pending'
  taskId = res.id

  let result: TaskResult
  if (res.status === 'done' && res.result) {
    result = res.result
  }
  else {
    const socket = new WebSocket(`${config.public.wsBase}/task/${taskId}/event/v1`)
    result = await new Promise<TaskResult>((resolve) => {
      socket.addEventListener('message', (e) => {
        try {
          const data: QueryV1Message = JSON.parse(e.data)
          if (data.type === 'status') {
            status = data.status
          }
          else if (data.type === 'result') {
            socket.close()
            resolve(data.result)
          }
          else if (data.type === 'error') {
            errorId = data.error_id ?? 'undefined'
            socket.close()
          }
          else if (data.type === 'not_found') {
            errorId = 'not_found'
            socket.close()
          }
        }
        catch (e) {
          console.error(e)
        }
      })
    })
    socket.close()
  }

  status = 'rendering'

  // layer translation_mask on top of original image
  const canvas = document.createElement('canvas')
  const canvasCtx = canvas.getContext('2d')!
  // draw original image
  const img = new Image()
  img.src = fileUri
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
    resultBlob = blob
  }, 'image/png')
}

let resultUri = $ref('')
watch($$(resultBlob), (blob) => {
  if (resultUri)
    URL.revokeObjectURL(resultUri)
  resultUri = blob ? URL.createObjectURL(blob) : ''
})

const saveAsPNG = () => {
  if (!resultUri || !taskId)
    return

  const a = document.createElement('a')
  a.href = resultUri
  a.download = `translation-${taskId}.png`
  a.classList.add('hidden')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const reset = () => {
  file = null
  taskId = ''
  errorId = ''
  errorStatus = ''
  resultBlob = null
  status = ''
}
</script>

<template>
  <div class="flex justify-between items-center gap-6 w-full aspect-16/9">
    <div class="flex-1 flex flex-col min-w-0 h-full">
      <label
        class="flex-1 rounded-2xl border border-zinc-300"
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
            class="flex items-center gap-8"
          >
            <img :src="resultUri" class="object-contain w-80 max-h-80">

            <div class="flex flex-col gap-4">
              <div class="flex justify-center items-center gap-1 text-lg">
                <div class="i-ri:check-line w-5 h-5" />
                Translation Success
              </div>

              <button
                class="px-6 py-1 rounded-full text-fuchsia-600 border-2 border-fuchsia-300"
                @click.prevent="saveAsPNG"
              >
                Save as PNG
              </button>

              <button
                class="px-6 py-1 rounded-full text-fuchsia-600 border-2 border-fuchsia-300"
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
              We experienced an error while translating your image.
              <div v-if="errorStatus" class="text-sm">Status: {{ errorStatus }}</div>
              <div v-if="taskId" class="text-sm">Task ID: {{ taskId }}</div>
              <div v-if="errorId" class="text-sm">Error ID: {{ errorId }}</div>
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
            class="flex items-center gap-8"
          >
            <div class="flex flex-col gap-4">
              <div class="flex justify-center items-center gap-1 text-lg">
                <div class="i-ri:file-search-line w-5 h-5" />
                File Preview
              </div>

              <img :src="fileUri" class="object-contain w-72 max-h-72">

              <div class="flex justify-center">
                <botton
                  class="px-6 py-1 rounded-full text-fuchsia-600 border-2 border-fuchsia-300"
                  @click.prevent="upload"
                >
                  Translate
                </botton>
              </div>
            </div>

            <div class="flex flex-col gap-2 pointer-events-none">
              <div class="flex justify-center items-center gap-1 text-lg">
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
              </label>
            </div>
          </div>

          <div v-else class="flex items-center gap-2 cursor-pointer">
            <i class="i-ri:image-add-line w-8 h-8 text-zinc-500" />
            Paste an image, click to select, or drag and drop
          </div>
        </div>
      </label>
    </div>
  </div>
</template>
