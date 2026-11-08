const {resolve}=require('node:path');
const root=resolve(process.argv[2]);
const {RBACManager,Role,Permission}=require(`${root}/dist/auth/rbac.js`);
const r=new RBACManager(),org='tenant-a',user={userId:'owner',organizationId:org};
const holdout=['','   ',null,false,0,[],{},['owner']].map((owner,i)=>({
 id:`invalid-owner-${i}`,passed:r.canAccessResource([Role.ADMIN],Permission.EVENT_READ,{organizationId:org,userId:owner},user)===false
}));
const check=(id,roles,resource,identity,expected)=>({id,passed:r.canAccessResource(roles,Permission.EVENT_READ,resource,identity)===expected});
const anchors=[
 check('same-owner',[Role.VIEWER],{organizationId:org,userId:'owner'},user,true),
 check('admin-same-tenant',[Role.ADMIN],{organizationId:org,userId:'other'},user,true),
 check('viewer-other-owner',[Role.VIEWER],{organizationId:org,userId:'other'},user,false),
 check('admin-cross-tenant',[Role.ADMIN],{organizationId:'tenant-b',userId:'other'},user,false),
 check('missing-user-tenant',[Role.ADMIN],{organizationId:org,userId:'other'},{userId:'owner'},false),
 check('unscoped-resource',[Role.VIEWER],{},user,true),
 check('no-base-permission',[],{organizationId:org,userId:'owner'},user,false),
 check('explicit-super-admin',[Role.SUPER_ADMIN],{organizationId:org,userId:''},user,true)
];
console.log(JSON.stringify({holdout,anchors}));
