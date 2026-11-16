import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentRowHash, deploymentDigest, postgresDeploymentHash, productionSourceScope, sqlIdentifier } from '../server/footballAnalytics/deploymentIntegrity.ts';

test('deployment digests preserve exact Unicode, nulls, numbers and column boundaries', () => {
  assert.notEqual(deploymentRowHash(['ab', 'c']), deploymentRowHash(['a', 'bc']));
  assert.notEqual(deploymentRowHash([null]), deploymentRowHash(['N;']));
  assert.notEqual(deploymentRowHash([0]), deploymentRowHash([null]));
  assert.equal(deploymentRowHash(['Niš', 2, null]), deploymentRowHash(['Niš', 2, null]));
  assert.notEqual(deploymentRowHash(['Niš', 2]), deploymentRowHash(['Nis', 2]));
});
test('table integrity checks are order-independent but detect changed, missing or duplicated rows', () => {
  const a = deploymentRowHash(['a', 1]), b = deploymentRowHash(['b', 2]);
  const one = deploymentDigest(), two = deploymentDigest();
  one.add(a); one.add(b); two.add(b); two.add(a);
  assert.deepEqual(one.value(), two.value());
  two.add(a); two.add(a);
  assert.notDeepEqual(one.value(), two.value());
  const changed = deploymentDigest(); changed.add(a); changed.add(deploymentRowHash(['b', 3]));
  assert.notDeepEqual(one.value(), changed.value());
  assert.throws(() => one.add('bad'), /digest/);
});
test('production transfer excludes isolated test observations without fabricating replacements', () => {
  assert.equal(productionSourceScope(['id', 'environment', 'payload']), "WHERE environment='real'");
  assert.match(productionSourceScope(['id', 'payload']), /!= 'test'/);
  assert.equal(productionSourceScope(['version']), '');
});
test('remote hashes use UTF-8 byte length and safe SQL identifiers', () => {
  assert.match(postgresDeploymentHash(['id', 'payload']), /octet_length\("payload"::text\)/);
  assert.match(postgresDeploymentHash(['id', 'payload']), /sha256\(convert_to/);
  assert.equal(sqlIdentifier('fa_matches'), '"fa_matches"');
  assert.throws(() => sqlIdentifier('payload; DROP TABLE users'), /identifier/);
});
