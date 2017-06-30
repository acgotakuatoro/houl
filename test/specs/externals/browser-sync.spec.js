'use strict'

const path = require('path')
const fs = require('fs')
const http = require('http')
const td = require('testdouble')
const transform = require('../../helpers').transform
const waitForData = require('../../helpers').waitForData
const Config = require('../../../lib/models/config')
const create = require('../../../lib/externals/browser-sync')

const base = path.resolve(__dirname, '../../fixtures')

function reqTo (pathname) {
  return 'http://localhost:51234' + pathname
}

function expectDataToBeFile (data, filename) {
  expect(data).toBe(
    fs.readFileSync(path.join(base, filename), 'utf8')
  )
}

describe('Using browsersync', () => {
  const config = new Config({
    input: '',
    output: 'dist',
    rules: {
      js: 'js'
    }
  }, {
    js: stream => {
      return stream.pipe(transform((file, encoding, callback) => {
        const source = file.contents.toString()
        file.contents = Buffer.from('**transformed**\n' + source)
        callback(null, file)
      }))
    }
  }, { base })

  const mockResolver = {
    register: td.function()
  }

  let bs
  describe('without base path', () => {
    beforeAll(done => {
      bs = create(config, {
        port: 51234,
        open: false,
        logLevel: 'silent'
      }, mockResolver, '/')

      bs.emitter.on('init', done)
    })

    afterAll(() => {
      bs.exit()
    })

    it('starts dev server by the given port', done => {
      http.get(reqTo('/sources/'), waitForData((res, data) => {
        expect(res.statusCode).toBe(200)
        expectDataToBeFile(data, 'sources/index.html')
        done()
      }))
    })

    it('executes corresponding task to transform sources', done => {
      http.get(reqTo('/sources/index.js'), waitForData((res, data) => {
        expect(data).toMatch(/^\*\*transformed\*\*\n/)
        done()
      }))
    })

    it('redirects if the specified path does not have trailing slash and it points to a directory', done => {
      http.get(reqTo('/sources'), res => {
        expect(res.statusCode).toBe(301)
        expect(res.headers.location).toBe('/sources/')
        done()
      })
    })

    it('registers requested files to dep resolver', done => {
      http.get(reqTo('/sources/index.scss'), () => {
        const absPath = path.resolve(base, 'sources/index.scss')
        const content = fs.readFileSync(absPath, 'utf8')
        td.verify(mockResolver.register(absPath, content))
        done()
      })
    })
  })

  describe('with base path', () => {
    beforeAll(done => {
      bs = create(config, {
        port: 51234,
        open: false,
        logLevel: 'silent'
      }, mockResolver, '/path/to/base/')

      bs.emitter.on('init', done)
    })

    afterAll(() => {
      bs.exit()
    })

    it('allows to set base path of assets', done => {
      http.get(reqTo('/path/to/base/sources/index.html'), waitForData((res, data) => {
        expect(res.statusCode).toBe(200)
        expectDataToBeFile(data, 'sources/index.html')
        done()
      }))
    })

    it('returns not found message if the req does not follow the base path', done => {
      http.get(reqTo('/sources/index.html'), res => {
        expect(res.statusCode).toBe(404)
        done()
      })
    })

    it('redirects if it requests to the root of base path', done => {
      http.get(reqTo('/path/to/base'), res => {
        expect(res.statusCode).toBe(301)
        expect(res.headers.location).toBe('/path/to/base/')
        done()
      })
    })
  })
})
