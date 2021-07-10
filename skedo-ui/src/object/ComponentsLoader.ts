import React from "react"
import {Emiter, ComponentMetaConfig, ComponentMeta, Topic} from "@skedo/core"
import * as R from 'ramda'
import yaml from 'js-yaml'

import {componentRemote} from '@skedo/request'


const metas: {[key:string] : ComponentMeta} = {}  
const ymls: {[key:string] : ComponentMetaConfig} = {}  
const localComponentsMap : {[key:string] : React.ComponentClass} = {}  



// @ts-ignore
require.context('../components/localComponents', true, /\.tsx$/)
	.keys()
	.forEach( (key : string) => {
		key = key.replace('./', '')
		const [a,] = key.split('.')
		localComponentsMap['local.' + a] = require(`../components/localComponents/${key}`).default
	})

// @ts-ignore
require.context('../', true, /\.yml$/)
	.keys()
	.forEach( (key : string) => {
		key = key.replace('./', '')
		const [a,] = key.split('.')
		const n = a.split('/').pop()
		if(n && n !== 'default') {
			const config : ComponentMetaConfig = require(`../${key}`)
			ymls[config.group + '.' + config.type] = config 
		}
	})


export default class ComponentsLoader extends Emiter<Topic> {

	static inst : ComponentsLoader  = new ComponentsLoader() 

	static defaultProps : ComponentMetaConfig = require('../yml/default.yml')
	state : number = 0
	list : Array<ComponentMeta> = []


	static loadByType(group : string, type :string) : ComponentMeta {
    const key = group + '.'  + type
		if (!metas[key]) {
      const props = R.clone(
        ComponentsLoader.defaultProps
      )
      if (!ymls[key]) {
        throw new Error("Type " + key + " not found.")
      }
      const customProps = ymls[key]

      const merged = mergeLeft(props, customProps)
      const meta = new ComponentMeta(merged)
      metas[key] = meta
    }
    return metas[key]
	}

	static getLocalComponentByURL(url: string) : React.ComponentClass {
		return localComponentsMap[url] || null
	}

	static get() {
		return ComponentsLoader.inst
	}

  private async loadRemote(){
    const json = await componentRemote.get() 
    for(let item of json.data) {
      try {
        const yml = item.yml
        if(!item.yml) {
          throw new Error('yml not defined.')
        }
        const resp = await fetch(yml)
        const content = await resp.text()
        const config: ComponentMetaConfig = yaml.load(
          content
        ) as any
        ymls[config.group + "." + config.type] = config
        ComponentsLoader.loadByType(
          config.group,
          config.type
        )
      } catch (ex) {
        console.error(`load component ${item.group}.${item.type} error`, ex.toString())
      }
    }
  }

	async load(){
		if(this.state === 1) {
			this.emit(Topic.Loaded)
			return
		}
		for(let key in ymls) {
      const [group, name] = key.split('.')
			ComponentsLoader.loadByType(group, name)
		}
    await this.loadRemote()
		this.state = 1
		this.list = Object.values(metas).filter(meta => meta.intrinsic !== true)
		this.emit(Topic.Loaded)
    
	}
}



function mergeLeft(a : any, b : any) {
  if(Array.isArray(a) && Array.isArray(b)) {
    const list = [...a]

    for(let i = 0; i < b.length; i++) {

      let match = false
      for(let j = 0; j < a.length; j++) {
        if(b[i].name === a[j].name) {
          match = true
          a[j] = mergeLeft(a[j], b[i])
          // list.push(mergeLeft(a[i], b[j]))
          break
        } 
      }

      if(!match)  {
        list.push(b[i])
      }
    }
    return list
  }
  else if(typeof(a) === 'object' && typeof(b) === 'object' ){
    for(let key in b) {
      const val = b[key]
      if(!a[key]) {
        a[key] = b[key]
        continue
      }

      if(typeof(val) === 'object' || Array.isArray(val)) {
        a[key] = mergeLeft(a[key], val)
      }
      else {
        a[key] = b[key]
      }
    }
  }
  return a
}