/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+relay
 * @flow strict-local
 * @format
 */

'use strict';

const fs = require('fs');
const invariant = require('invariant');

import type {Filesystem, SourceControl} from 'relay-compiler';

/**
 * A filesystem wrapper that buffers file reads and writes until `commit()` is
 * called.
 */
class BufferedFilesystem implements Filesystem {
  buffer: Map<string, ?string> = new Map();
  committed: boolean = false;

  _assertNotComitted() {
    invariant(
      !this.committed,
      'BufferedFilesystem: no operations allowed after commit().',
    );
  }

  async commit(sourceControl: ?SourceControl) {
    this._assertNotComitted();
    this.committed = true;

    const removed = [];
    const added = [];
    for (const [path, data] of this.buffer) {
      if (data == null) {
        removed.push(path);
        fs.unlinkSync(path);
      } else {
        const fileExisits = fs.existsSync(path);
        const currentData = fileExisits ? fs.readFileSync(path, 'utf8') : null;
        if (currentData !== data) {
          added.push(path);
          fs.writeFileSync(path, data, 'utf8');
        }
      }
    }
    if (sourceControl) {
      await sourceControl.addRemove(added, removed);
    }
  }

  hasChanges(): boolean {
    this._assertNotComitted();
    return this.buffer.size > 0;
  }

  getAddedRemovedFiles(): {|
    +added: $ReadOnlyArray<string>,
    +removed: $ReadOnlyArray<string>,
  |} {
    this._assertNotComitted();
    const added = [];
    const removed = [];
    for (const [path, data] of this.buffer) {
      if (data == null) {
        removed.push(path);
      } else {
        if (!fs.existsSync(path)) {
          added.push(path);
        }
      }
    }
    return {
      added,
      removed,
    };
  }

  existsSync(path: string): boolean {
    this._assertNotComitted();
    return this.buffer.has(path)
      ? Boolean(this.buffer.get(path))
      : fs.existsSync(path);
  }

  mkdirSync(path: string): void {
    this._assertNotComitted();
    fs.mkdirSync(path);
  }

  readdirSync(path: string): Array<string> {
    this._assertNotComitted();
    throw new Error('BufferedFilesystem: readdirSync is not implemented.');
  }

  readFileSync(path: string, encoding: string): string {
    this._assertNotComitted();
    if (this.buffer.has(path)) {
      const data = this.buffer.get(path);
      invariant(
        data != null,
        'BufferedFilesystem: trying to read deleted file.',
      );
      return data;
    }
    return fs.readFileSync(path, encoding);
  }

  statSync(path: string): {isDirectory(): boolean} {
    this._assertNotComitted();
    return fs.statSync(path);
  }

  unlinkSync(path: string): void {
    this._assertNotComitted();
    this.buffer.set(path, null);
  }

  writeFileSync(filename: string, data: string, encoding: string): void {
    this._assertNotComitted();
    this.buffer.set(filename, data);
  }

  changedFilesToJSON(): {|
    +changed: $ReadOnlyArray<{|
      +path: string,
      +data: string,
    |}>,
    +removed: $ReadOnlyArray<{|
      +path: string,
    |}>,
  |} {
    this._assertNotComitted();
    const changed = [];
    const removed = [];
    for (const [path, data] of this.buffer) {
      if (data == null) {
        removed.push({path});
      } else {
        changed.push({path, data});
      }
    }
    return {
      removed,
      changed,
    };
  }
}

module.exports = BufferedFilesystem;
