import {it,expect} from 'vitest';
import {reportTaxonomyLabel} from './taxonomy';
it('T04: historical taxonomy localizes independently of report market',()=>{
  expect(reportTaxonomyLabel('灣仔區','district','hk','en')).toBe('Wan Chai District');
  expect(reportTaxonomyLabel('餐飲','industry','hk','en')).toBe('F&B / Restaurant');
  expect(reportTaxonomyLabel('wan-chai','district','hk','zh-TW')).toBe('灣仔區');
  expect(reportTaxonomyLabel('unrecognized','district','hk','en')).toBe('unrecognized');
});
