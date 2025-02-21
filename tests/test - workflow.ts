import { runFromFile } from '../dist/index'
import { EventEmitter } from 'node:events'

const ee = new EventEmitter()
runFromFile('./workflow.yml').then(({ result }) => console.log(result.tests[0].steps.map(s => [s.name, s.passed])))
