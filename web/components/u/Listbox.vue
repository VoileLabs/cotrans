<script lang="ts" setup>
const props = defineProps<{
  items: Record<string, string>
  modelValue: string
  class?: string
}>()
const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const modelValue = useVModel(props, 'modelValue', emit)

const rootEl = shallowRef<HTMLDivElement | null>()
const optionsEl = shallowRef<HTMLDivElement | null>()

const rootPos = useElementBounding(rootEl, { immediate: true })

const diaOpen = ref(false)
function updateOpen(n: boolean) {
  diaOpen.value = n
}
watch(diaOpen, () => {
  rootPos.update()
}, { flush: 'pre' })

const optionsTop = computed(() => rootPos.top.value + rootPos.height.value)
const optionsBottom = computed(() => window.innerHeight - rootPos.top.value)
const optionsLeft = computed(() => rootPos.left.value)
const optionsHeight = computed(() => Math.min(window.innerHeight - optionsTop.value - 16, 240))
const toTop = computed(() => optionsHeight.value < 200 && optionsTop.value > (240 + rootPos.height.value))
</script>

<template>
  <HListbox v-slot="{ open }" v-model="modelValue">
    <!-- TODO remove this -->
    <div class="hidden" :data-todo="updateOpen(open)" />

    <div ref="rootEl" class="mt-1" :class="props.class">
      <HListboxButton class="focus:outline-none relative w-full py-1 pl-4 pr-8 rounded-full text-left shadow-sm ring-1 ring-fuchsia-300 dark:ring-gray-700 focus-visible:ring-offset-1 focus-visible:ring-offset-fuchsia-400 dark:focus-visible:ring-offset-gray-500">
        <span class="block truncate">{{ items[modelValue] }}</span>
        <span class="pointer-events-none absolute flex inset-y-0 right-0 pr-2 items-center">
          <span
            class="i-ri:arrow-down-s-line w-5 h-5 text-gray-400 transition-transform"
            :class="{ 'rotate-180': open }"
            aria-hidden="true"
          />
        </span>
      </HListboxButton>

      <Teleport to="body">
        <div
          ref="optionsEl"
          class="z-51 fixed -mx-1 py-2 px-1 rounded-md overflow-hidden"
          :style="{
            top: toTop ? undefined : `${optionsTop}px`,
            bottom: toTop ? `${optionsBottom}px` : undefined,
            left: `${optionsLeft}px`,
            width: `calc(${rootPos.width.value}px + 0.5rem)`,
          }"
        >
          <Transition
            enter-active-class="transition ease-out duration-85 transform"
            :enter-from-class="`${toTop ? 'translate-y-1/3' : '-translate-y-1/3'} opacity-40`"
            enter-to-class="translate-y-0 opacity-100"
            leave-active-class="transition ease-out duration-85 transform"
            leave-from-class="translate-y-0 opacity-100"
            :leave-to-class="`${toTop ? 'translate-y-1/3' : '-translate-y-1/3'} opacity-0`"
          >
            <HListboxOptions
              class="focus:outline-none w-full rounded-md overflow-auto text-base shadow ring-1 ring-gray-300 ring-opacity-10 bg-white dark:bg-gray-800"
              :style="{
                maxHeight: toTop ? undefined : `${optionsHeight}px`,
              }"
            >
              <HListboxOption
                v-for="(value, id) in items"
                v-slot="{ active, selected }"
                :key="id"
                :value="id"
                as="template"
              >
                <li
                  class="relative py-1 pl-8 pr-4 cursor-pointer select-none"
                  :class="active ? 'bg-fuchsia-50 text-fuchsia-900 dark:bg-indigo-900 dark:text-fuchsia-50' : 'text-gray-900 dark:text-gray-100'"
                >
                  <span
                    class="block truncate"
                    :class="selected ? 'font-medium' : 'font-normal'"
                  >{{ value }}</span>
                  <span
                    v-if="selected"
                    class="absolute inset-y-0 left-0 flex items-center pl-2.5 text-fuchsia-600 dark:text-fuchsia-300"
                  ><span class="i-ri:check-line h-4 w-4" aria-hidden="true" /></span>
                </li>
              </HListboxOption>
            </HListboxOptions>
          </Transition>
        </div>
      </Teleport>
    </div>
  </HListbox>
</template>
