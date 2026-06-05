/**
@license

   Copyright (C) 1997 - 2002, Makoto Matsumoto and Takuji Nishimura,
   All rights reserved.

   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions
   are met:

     1. Redistributions of source code must retain the above copyright
        notice, this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright
        notice, this list of conditions and the following disclaimer in the
        documentation and/or other materials provided with the distribution.

     3. The names of its contributors may not be used to endorse or promote
        products derived from this software without specific prior written
        permission.

   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
   "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
   LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
   A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR
   CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
   EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
   PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
   PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
   LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
   NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
   SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
function _0x2178(){var _0x3e5b04=['init_genrand','16628kaSmYR','3503927ubzOqw','prototype','7020050MNqJMH','3355230EUeUen','225FHOuPa','mti','8zLJwIt','random','genrand_int32','LOWER_MASK','UPPER_MASK','MATRIX_A','2134017AMdYFZ','1148550PpIqJO','getTime','1159902HFiytc'];_0x2178=function(){return _0x3e5b04;};return _0x2178();}var _0x24eb90=_0x578b;function _0x578b(_0x1540f3,_0x4e87a5){var _0x21780d=_0x2178();return _0x578b=function(_0x578b49,_0x3c55ab){_0x578b49=_0x578b49-0x9d;var _0x20a617=_0x21780d[_0x578b49];return _0x20a617;},_0x578b(_0x1540f3,_0x4e87a5);}(function(_0x4c3687,_0xedefa7){var _0x5a961f=_0x578b,_0x4c7726=_0x4c3687();while(!![]){try{var _0x4488b1=-parseInt(_0x5a961f(0xa6))/0x1+parseInt(_0x5a961f(0xa8))/0x2+-parseInt(_0x5a961f(0x9d))/0x3*(-parseInt(_0x5a961f(0xaa))/0x4)+parseInt(_0x5a961f(0xad))/0x5+-parseInt(_0x5a961f(0xae))/0x6+-parseInt(_0x5a961f(0xab))/0x7*(-parseInt(_0x5a961f(0x9f))/0x8)+-parseInt(_0x5a961f(0xa5))/0x9;if(_0x4488b1===_0xedefa7)break;else _0x4c7726['push'](_0x4c7726['shift']());}catch(_0x191123){_0x4c7726['push'](_0x4c7726['shift']());}}}(_0x2178,0xcfde5));var MersenneTwister=function(_0x5dd168){var _0x5fc718=_0x578b;_0x5dd168==undefined&&(_0x5dd168=new Date()[_0x5fc718(0xa7)]()),this['N']=0x270,this['M']=0x18d,this['MATRIX_A']=0x9908b0df,this[_0x5fc718(0xa3)]=0x80000000,this[_0x5fc718(0xa2)]=0x7fffffff,this['mt']=new Array(this['N']),this['mti']=this['N']+0x1,this[_0x5fc718(0xa9)](_0x5dd168);};MersenneTwister[_0x24eb90(0xac)]['init_genrand']=function(_0x2e876a){var _0x5f11b7=_0x24eb90;this['mt'][0x0]=_0x2e876a>>>0x0;for(this[_0x5f11b7(0x9e)]=0x1;this[_0x5f11b7(0x9e)]<this['N'];this['mti']++){var _0x2e876a=this['mt'][this[_0x5f11b7(0x9e)]-0x1]^this['mt'][this[_0x5f11b7(0x9e)]-0x1]>>>0x1e;this['mt'][this[_0x5f11b7(0x9e)]]=(((_0x2e876a&0xffff0000)>>>0x10)*0x6c078965<<0x10)+(_0x2e876a&0xffff)*0x6c078965+this[_0x5f11b7(0x9e)],this['mt'][this[_0x5f11b7(0x9e)]]>>>=0x0;}},MersenneTwister[_0x24eb90(0xac)][_0x24eb90(0xa1)]=function(){var _0x242dff=_0x24eb90,_0x5515a3,_0x2b335f=new Array(0x0,this[_0x242dff(0xa4)]);if(this[_0x242dff(0x9e)]>=this['N']){var _0x754a8e;if(this['mti']==this['N']+0x1)this[_0x242dff(0xa9)](0x1571);for(_0x754a8e=0x0;_0x754a8e<this['N']-this['M'];_0x754a8e++){_0x5515a3=this['mt'][_0x754a8e]&this[_0x242dff(0xa3)]|this['mt'][_0x754a8e+0x1]&this['LOWER_MASK'],this['mt'][_0x754a8e]=this['mt'][_0x754a8e+this['M']]^_0x5515a3>>>0x1^_0x2b335f[_0x5515a3&0x1];}for(;_0x754a8e<this['N']-0x1;_0x754a8e++){_0x5515a3=this['mt'][_0x754a8e]&this[_0x242dff(0xa3)]|this['mt'][_0x754a8e+0x1]&this[_0x242dff(0xa2)],this['mt'][_0x754a8e]=this['mt'][_0x754a8e+(this['M']-this['N'])]^_0x5515a3>>>0x1^_0x2b335f[_0x5515a3&0x1];}_0x5515a3=this['mt'][this['N']-0x1]&this[_0x242dff(0xa3)]|this['mt'][0x0]&this[_0x242dff(0xa2)],this['mt'][this['N']-0x1]=this['mt'][this['M']-0x1]^_0x5515a3>>>0x1^_0x2b335f[_0x5515a3&0x1],this[_0x242dff(0x9e)]=0x0;}return _0x5515a3=this['mt'][this[_0x242dff(0x9e)]++],_0x5515a3^=_0x5515a3>>>0xb,_0x5515a3^=_0x5515a3<<0x7&0x9d2c5680,_0x5515a3^=_0x5515a3<<0xf&0xefc60000,_0x5515a3^=_0x5515a3>>>0x12,_0x5515a3>>>0x0;},MersenneTwister['prototype'][_0x24eb90(0xa0)]=function(){var _0x2e81f6=_0x24eb90;return this[_0x2e81f6(0xa1)]()*(0x1/0x100000000);};