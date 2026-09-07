// Preloaded in the fixture Next process and inherited by every Node child.
const net = require('node:net');
const dns = require('node:dns');
const local = host => host === 'localhost' || host === '::1' || host === '[::1]' || (net.isIP(host) === 4 && host.startsWith('127.'));
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
 const first=args[0]; const options=Array.isArray(first)?first[0]:first;
 const host=typeof options==='object'&&options!==null?options.host:typeof args[1]==='string'?args[1]:undefined;
 if(typeof options==='string'&&!/^\d+$/.test(options))return original.apply(this,args); // local IPC
 if(host && !local(host))throw new Error('fixture_external_transport_forbidden');
 if(options && typeof options==='object' && options.lookup)throw new Error('fixture_custom_lookup_forbidden');
 return original.apply(this,args);
};
const lookup=dns.lookup;
dns.lookup=function(host,...args){
 if(!local(host))throw new Error('fixture_external_dns_forbidden');
 const callback=args.pop();
 return lookup.call(this,host,...args,(error,address,...rest)=>{
  if(!error && !(Array.isArray(address)?address.every(entry=>local(entry.address)):local(address)))return callback(new Error('fixture_external_dns_forbidden'));
  callback(error,address,...rest);
 });
};
const dgram=require('node:dgram');
dgram.Socket.prototype.send=function(){throw new Error('fixture_datagram_forbidden');};
