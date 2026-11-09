/** A clean checkout has no generated artifact directory before its first pack. */
import {mkdir} from 'node:fs/promises'
await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true})
